import "server-only";

import { and, desc, eq, type SQL, sql } from "drizzle-orm";

import type {
  MatterOperationDto,
  MatterOperationEventType,
  MatterOperationState,
} from "@/lib/contracts/matter-operations";
import { createDrizzleDb } from "@/lib/server/adapters/neon";
import { matterOperations } from "@/lib/server/db/schema/matter-operations";

import { insertMatterOperationEvent } from "./events-store";
import { toMatterOperationDto } from "./mappers";

type DrizzleDb = ReturnType<typeof createDrizzleDb>;

const preserveIgnoredOrUntrackedState = sql<string>`
  case
    when ${matterOperations.state} in ('ignored', 'untracked')
      then ${matterOperations.state}
    else excluded.state
  end
`;

const preserveIgnoredOrUntrackedCurrent = sql<boolean>`
  case
    when ${matterOperations.state} in ('ignored', 'untracked')
      then ${matterOperations.current}
    else true
  end
`;

export async function upsertReviewActionMatterOperation(
  db: DrizzleDb,
  input: {
    blocking: boolean;
    caseId: string;
    operationKey: string;
    priority: string;
    provenanceRefs: unknown;
    requiredCapability: string;
    sourceId: string;
    sourceRunId: string;
    state: MatterOperationState;
    summary: string;
    title: string;
  },
): Promise<MatterOperationDto> {
  const [operationRow] = await db
    .insert(matterOperations)
    .values({
      blocking: input.blocking,
      caseId: input.caseId,
      current: true,
      operationKey: input.operationKey,
      priority: input.priority,
      provenanceRefs: input.provenanceRefs,
      requiredCapability: input.requiredCapability,
      sourceId: input.sourceId,
      sourceRunId: input.sourceRunId,
      sourceType: "review_action",
      state: input.state,
      summary: input.summary,
      title: input.title,
    })
    .onConflictDoUpdate({
      target: [
        matterOperations.caseId,
        matterOperations.sourceType,
        matterOperations.sourceId,
      ],
      set: {
        blocking: sql`excluded.blocking`,
        current: preserveIgnoredOrUntrackedCurrent,
        operationKey: sql`excluded.operation_key`,
        priority: sql`excluded.priority`,
        provenanceRefs: sql`excluded.provenance_refs`,
        requiredCapability: sql`excluded.required_capability`,
        sourceRunId: sql`excluded.source_run_id`,
        state: preserveIgnoredOrUntrackedState,
        summary: sql`excluded.summary`,
        title: sql`excluded.title`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return toMatterOperationDto(operationRow);
}

export async function upsertRevisionClaimMatterOperation(
  db: DrizzleDb,
  input: {
    caseId: string;
    operationKey: string;
    previousSourceHash: string;
    priority: string;
    provenanceRefs: unknown;
    sourceHash: string;
    sourceId: string;
    state: MatterOperationState;
    summary: string;
    title: string;
  },
): Promise<MatterOperationDto> {
  const [operationRow] = await db
    .insert(matterOperations)
    .values({
      blocking: false,
      caseId: input.caseId,
      current: true,
      operationKey: input.operationKey,
      previousSourceHash: input.previousSourceHash,
      priority: input.priority,
      provenanceRefs: input.provenanceRefs,
      requiredCapability: "document_version_review",
      sourceHash: input.sourceHash,
      sourceId: input.sourceId,
      sourceRunId: null,
      sourceType: "revision_claim",
      state: input.state,
      summary: input.summary,
      title: input.title,
    })
    .onConflictDoUpdate({
      target: [
        matterOperations.caseId,
        matterOperations.sourceType,
        matterOperations.sourceId,
      ],
      set: {
        blocking: sql`excluded.blocking`,
        current: preserveIgnoredOrUntrackedCurrent,
        previousSourceHash: sql`excluded.previous_source_hash`,
        priority: sql`excluded.priority`,
        provenanceRefs: sql`excluded.provenance_refs`,
        requiredCapability: sql`excluded.required_capability`,
        sourceHash: sql`excluded.source_hash`,
        state: preserveIgnoredOrUntrackedState,
        summary: sql`excluded.summary`,
        title: sql`excluded.title`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  return toMatterOperationDto(operationRow);
}

export async function markMatterOperationSuperseded(
  db: DrizzleDb,
  input: {
    operationId: string;
    supersededByOperationId: string;
  },
): Promise<MatterOperationDto | null> {
  const [updatedOperation] = await db
    .update(matterOperations)
    .set({
      current: false,
      state: "superseded",
      supersededByOperationId: input.supersededByOperationId,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(matterOperations.id, input.operationId), eq(matterOperations.current, true)),
    )
    .returning();

  return updatedOperation ? toMatterOperationDto(updatedOperation) : null;
}

export async function listMatterOperationsByCaseId(input: {
  caseId: string;
  includeHistory?: boolean;
}): Promise<MatterOperationDto[]> {
  const db = createDrizzleDb();
  const whereClause = input.includeHistory
    ? eq(matterOperations.caseId, input.caseId)
    : and(eq(matterOperations.caseId, input.caseId), eq(matterOperations.current, true));
  const rows = await db
    .select()
    .from(matterOperations)
    .where(whereClause)
    .orderBy(
      desc(matterOperations.current),
      sql`
        case ${matterOperations.priority}
          when 'critical' then 0
          when 'high' then 1
          when 'medium' then 2
          else 3
        end
      `,
      desc(matterOperations.blocking),
      desc(matterOperations.updatedAt),
      desc(matterOperations.id),
    );

  return rows.map(toMatterOperationDto);
}

export async function recordMatterOperationEvent(input: {
  actorId: string | null;
  caseId: string;
  eventType: Exclude<MatterOperationEventType, "opened" | "superseded">;
  metadata?: Record<string, unknown>;
  note: string | null;
  operationId: string;
}): Promise<MatterOperationDto> {
  const db = createDrizzleDb();
  const targetStateByEvent: Partial<
    Record<typeof input.eventType, MatterOperationState>
  > = {
    commented: undefined,
    dismissed: "dismissed",
    ignored: "ignored",
    marked_untracked: "untracked",
    reopened: "open",
    resolved: "resolved",
  };
  const targetState = targetStateByEvent[input.eventType] ?? null;
  const current =
    input.eventType === "reopened"
      ? true
      : input.eventType === "commented"
        ? null
        : true;
  const setValues: {
    current?: boolean;
    state?: MatterOperationState;
    updatedAt: SQL;
  } = {
    updatedAt: sql`now()`,
  };

  if (targetState) {
    setValues.state = targetState;
  }

  if (current !== null) {
    setValues.current = current;
  }

  const [updatedOperation] = await db
    .update(matterOperations)
    .set(setValues)
    .where(
      and(
        eq(matterOperations.id, input.operationId),
        eq(matterOperations.caseId, input.caseId),
      ),
    )
    .returning();

  if (!updatedOperation) {
    throw new Error("Matter operation not found for this case.");
  }

  await insertMatterOperationEvent({
    actorId: input.actorId,
    caseId: input.caseId,
    eventType: input.eventType,
    metadata: input.metadata,
    note: input.note,
    operationId: updatedOperation.id,
  });

  return toMatterOperationDto(updatedOperation);
}
