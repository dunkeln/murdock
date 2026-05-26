import "server-only";

import { eq } from "drizzle-orm";

import type { MatterOperationDto } from "@/lib/contracts/matter-operations";
import { createDrizzleDb } from "@/lib/server/adapters/neon";
import { caseReviewActions } from "@/lib/server/db/schema/matter-operations";

import { insertProjectedMatterOperationEvent } from "./events-store";
import {
  reviewActionProvenance,
  reviewActionState,
} from "./mappers";
import { upsertReviewActionMatterOperation } from "./operations-store";

export async function projectReviewActionsToMatterOperations(input: {
  caseId: string;
}): Promise<MatterOperationDto[]> {
  const db = createDrizzleDb();
  const actions = await db
    .select()
    .from(caseReviewActions)
    .where(eq(caseReviewActions.caseId, input.caseId));
  const operations: MatterOperationDto[] = [];

  for (const action of actions) {
    const state = reviewActionState(action.status);
    const operation = await upsertReviewActionMatterOperation(db, {
      blocking: action.blocking,
      caseId: action.caseId,
      operationKey: `review_action:${action.actionKey}`,
      priority: action.priority,
      provenanceRefs: reviewActionProvenance(action),
      requiredCapability: action.requiredCapability,
      sourceId: action.id,
      sourceRunId: action.reducerRunId,
      state,
      summary: action.summary,
      title: action.title,
    });
    operations.push(operation);

    await insertProjectedMatterOperationEvent(db, {
      caseId: operation.caseId,
      eventKey: `review_action:${action.id}:opened`,
      eventType: "opened",
      operationId: operation.id,
    });

    if (state === "resolved" || state === "dismissed") {
      await insertProjectedMatterOperationEvent(db, {
        caseId: operation.caseId,
        eventKey: `review_action:${action.id}:${state}`,
        eventType: state,
        operationId: operation.id,
      });
    }
  }

  return operations;
}
