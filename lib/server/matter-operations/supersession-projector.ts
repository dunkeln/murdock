import "server-only";

import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { MatterOperationDto } from "@/lib/contracts/matter-operations";
import { createDrizzleDb } from "@/lib/server/adapters/neon";
import {
  documentRevisionClaims,
  documentVersions,
  matterOperations,
} from "@/lib/server/db/schema/matter-operations";

import { insertProjectedMatterOperationEvent } from "./events-store";
import { markMatterOperationSuperseded } from "./operations-store";

type MatterOperationRow = typeof matterOperations.$inferSelect;

type RevisionOperationRow = MatterOperationRow & {
  claimId: string;
  documentFamilyId: string;
  fieldPath: string;
  claimUpdatedAt: Date;
  toVersionIndex: number;
};

function revisionOperationRankKey(operation: RevisionOperationRow) {
  return `${operation.documentFamilyId}:${operation.fieldPath}`;
}

function sortNewestRevisionFirst(
  left: RevisionOperationRow,
  right: RevisionOperationRow,
) {
  return (
    right.toVersionIndex - left.toVersionIndex ||
    right.claimUpdatedAt.getTime() - left.claimUpdatedAt.getTime() ||
    right.claimId.localeCompare(left.claimId)
  );
}

export async function supersedeOlderRevisionOperations(input: {
  caseId: string;
}): Promise<MatterOperationDto[]> {
  const db = createDrizzleDb();
  const toVersion = alias(documentVersions, "to_version");
  const rows = await db
    .select({
      blocking: matterOperations.blocking,
      caseId: matterOperations.caseId,
      claimId: documentRevisionClaims.id,
      claimUpdatedAt: documentRevisionClaims.updatedAt,
      createdAt: matterOperations.createdAt,
      current: matterOperations.current,
      documentFamilyId: documentRevisionClaims.documentFamilyId,
      fieldPath: documentRevisionClaims.fieldPath,
      id: matterOperations.id,
      operationKey: matterOperations.operationKey,
      previousSourceHash: matterOperations.previousSourceHash,
      priority: matterOperations.priority,
      provenanceRefs: matterOperations.provenanceRefs,
      requiredCapability: matterOperations.requiredCapability,
      sourceHash: matterOperations.sourceHash,
      sourceId: matterOperations.sourceId,
      sourceRunId: matterOperations.sourceRunId,
      sourceType: matterOperations.sourceType,
      state: matterOperations.state,
      summary: matterOperations.summary,
      supersededByOperationId: matterOperations.supersededByOperationId,
      title: matterOperations.title,
      toVersionIndex: toVersion.versionIndex,
      updatedAt: matterOperations.updatedAt,
    })
    .from(matterOperations)
    .innerJoin(documentRevisionClaims, eq(documentRevisionClaims.id, matterOperations.sourceId))
    .innerJoin(toVersion, eq(toVersion.id, documentRevisionClaims.toDocumentVersionId))
    .where(
      and(
        eq(matterOperations.caseId, input.caseId),
        eq(matterOperations.sourceType, "revision_claim"),
      ),
    );

  const operationsByRevisionSlot = new Map<string, RevisionOperationRow[]>();
  for (const row of rows) {
    const key = revisionOperationRankKey(row);
    operationsByRevisionSlot.set(key, [
      ...(operationsByRevisionSlot.get(key) ?? []),
      row,
    ]);
  }

  const superseded: MatterOperationDto[] = [];
  for (const operations of operationsByRevisionSlot.values()) {
    const [latestOperation, ...olderOperations] = operations.sort(
      sortNewestRevisionFirst,
    );
    if (!latestOperation) {
      continue;
    }

    for (const operation of olderOperations) {
      const updatedOperation = await markMatterOperationSuperseded(db, {
        operationId: operation.id,
        supersededByOperationId: latestOperation.id,
      });

      if (!updatedOperation) {
        continue;
      }

      superseded.push(updatedOperation);

      await insertProjectedMatterOperationEvent(db, {
        caseId: updatedOperation.caseId,
        eventKey: `matter_operation:${updatedOperation.id}:superseded:${updatedOperation.supersededByOperationId}`,
        eventType: "superseded",
        metadata: {
          supersededByOperationId: updatedOperation.supersededByOperationId,
        },
        operationId: updatedOperation.id,
      });
    }
  }

  return superseded;
}
