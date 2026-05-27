import "server-only";

import { eq } from "drizzle-orm";

import type { MatterOperationDto } from "@/lib/contracts/matter-operations";
import { deriveReviewWorkItemCapability } from "@/lib/contracts/review-work-item";
import { reviewWorkItemOperationKey } from "@/lib/review-work-items";
import { createDrizzleDb } from "@/lib/server/adapters/neon";
import { caseReviewWorkItems } from "@/lib/server/db/schema/matter-operations";

import { insertProjectedMatterOperationEvent } from "./events-store";
import { reviewWorkItemFromActionRow } from "./mappers";
import { upsertReviewActionMatterOperation } from "./operations-store";

export async function projectReviewActionsToMatterOperations(input: {
  caseId: string;
}): Promise<MatterOperationDto[]> {
  const db = createDrizzleDb();
  const actions = await db
    .select()
    .from(caseReviewWorkItems)
    .where(eq(caseReviewWorkItems.caseId, input.caseId));
  const operations: MatterOperationDto[] = [];

  for (const action of actions) {
    const item = reviewWorkItemFromActionRow(action);
    const state =
      item.status === "resolved" || item.status === "dismissed"
        ? item.status
        : "open";
    const operation = await upsertReviewActionMatterOperation(db, {
      blocking: item.blocking,
      caseId: item.caseId,
      operationKey: reviewWorkItemOperationKey(item),
      priority: item.priority,
      provenanceRefs: item.provenanceRefs.map((ref) => ({
        kind: ref.kind,
        label: ref.label,
        ref: ref.ref,
      })),
      requiredCapability: deriveReviewWorkItemCapability(item),
      sourceId: item.id,
      sourceRunId: item.origin.sourceRunId ?? action.sourceRunId,
      state,
      summary: item.summary,
      title: item.title,
    });
    operations.push(operation);

    await insertProjectedMatterOperationEvent(db, {
      caseId: operation.caseId,
      eventKey: `review_action:${item.id}:opened`,
      eventType: "opened",
      operationId: operation.id,
    });

    if (state === "resolved" || state === "dismissed") {
      await insertProjectedMatterOperationEvent(db, {
        caseId: operation.caseId,
        eventKey: `review_action:${item.id}:${state}`,
        eventType: state,
        operationId: operation.id,
      });
    }
  }

  return operations;
}
