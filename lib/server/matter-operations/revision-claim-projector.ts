import "server-only";

import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { MatterOperationDto } from "@/lib/contracts/matter-operations";
import type { ReviewActionPriority } from "@/lib/contracts/review-reducer";
import { createDrizzleDb } from "@/lib/server/adapters/neon";
import {
  documentRevisionClaims,
  documentVersions,
} from "@/lib/server/db/schema/matter-operations";

import { insertProjectedMatterOperationEvent } from "./events-store";
import {
  revisionClaimProvenance,
  revisionClaimState,
} from "./mappers";
import { upsertRevisionClaimMatterOperation } from "./operations-store";

export async function projectRevisionClaimsToMatterOperations(input: {
  caseId: string;
}): Promise<MatterOperationDto[]> {
  const db = createDrizzleDb();
  const fromVersion = alias(documentVersions, "from_version");
  const toVersion = alias(documentVersions, "to_version");
  const claims = await db
    .select({
      afterSourceSpanIds: documentRevisionClaims.afterSourceSpanIds,
      caseId: documentRevisionClaims.caseId,
      changeType: documentRevisionClaims.changeType,
      confidence: documentRevisionClaims.confidence,
      documentFamilyId: documentRevisionClaims.documentFamilyId,
      fieldLabel: documentRevisionClaims.fieldLabel,
      fieldPath: documentRevisionClaims.fieldPath,
      fromDocumentVersionId: documentRevisionClaims.fromDocumentVersionId,
      fromSnapshotHash: fromVersion.snapshotHash,
      fromVersionIndex: fromVersion.versionIndex,
      id: documentRevisionClaims.id,
      status: documentRevisionClaims.status,
      toDocumentVersionId: documentRevisionClaims.toDocumentVersionId,
      toSnapshotHash: toVersion.snapshotHash,
      toVersionIndex: toVersion.versionIndex,
      updatedAt: documentRevisionClaims.updatedAt,
    })
    .from(documentRevisionClaims)
    .innerJoin(
      fromVersion,
      eq(fromVersion.id, documentRevisionClaims.fromDocumentVersionId),
    )
    .innerJoin(toVersion, eq(toVersion.id, documentRevisionClaims.toDocumentVersionId))
    .where(eq(documentRevisionClaims.caseId, input.caseId));
  const operations: MatterOperationDto[] = [];

  for (const claim of claims) {
    const state = revisionClaimState(claim.status);
    const priority: ReviewActionPriority =
      claim.confidence === "high" ? "high" : "medium";
    const summary = [
      `${claim.fieldLabel} was ${claim.changeType.replaceAll("_", " ")}.`,
      `Compare document version ${claim.fromVersionIndex} to ${claim.toVersionIndex}.`,
    ].join(" ");
    const operation = await upsertRevisionClaimMatterOperation(db, {
      caseId: claim.caseId,
      operationKey: `revision_claim:${claim.documentFamilyId}:${claim.toDocumentVersionId}:${claim.fieldPath}:${claim.changeType}`,
      previousSourceHash: claim.fromSnapshotHash,
      priority,
      provenanceRefs: revisionClaimProvenance(claim),
      sourceHash: claim.toSnapshotHash,
      sourceId: claim.id,
      state,
      summary,
      title: `Document update: ${claim.fieldLabel}`,
    });
    operations.push(operation);

    await insertProjectedMatterOperationEvent(db, {
      caseId: operation.caseId,
      eventKey: `revision_claim:${claim.id}:opened`,
      eventType: "opened",
      operationId: operation.id,
    });

    if (state === "dismissed") {
      await insertProjectedMatterOperationEvent(db, {
        caseId: operation.caseId,
        eventKey: `revision_claim:${claim.id}:dismissed`,
        eventType: "dismissed",
        operationId: operation.id,
      });
    }
  }

  return operations;
}
