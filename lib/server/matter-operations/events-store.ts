import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import type {
  MatterOperationEventDto,
  MatterOperationEventType,
} from "@/lib/contracts/matter-operations";
import { createDrizzleDb } from "@/lib/server/adapters/neon";
import { matterOperationEvents } from "@/lib/server/db/schema/matter-operations";

import { toMatterOperationEventDto } from "./mappers";

type DrizzleDb = ReturnType<typeof createDrizzleDb>;

export async function insertProjectedMatterOperationEvent(
  db: DrizzleDb,
  input: {
    caseId: string;
    eventKey: string;
    eventType: MatterOperationEventType;
    metadata?: Record<string, unknown>;
    operationId: string;
  },
) {
  await db
    .insert(matterOperationEvents)
    .values({
      caseId: input.caseId,
      eventKey: input.eventKey,
      eventType: input.eventType,
      metadata: input.metadata ?? {},
      operationId: input.operationId,
    })
    .onConflictDoNothing({
      target: [matterOperationEvents.operationId, matterOperationEvents.eventKey],
      where: sql`${matterOperationEvents.eventKey} is not null`,
    });
}

export async function insertMatterOperationEvent(input: {
  actorId: string | null;
  caseId: string;
  eventType: MatterOperationEventType;
  metadata?: Record<string, unknown>;
  note: string | null;
  operationId: string;
}) {
  const db = createDrizzleDb();

  await db.insert(matterOperationEvents).values({
    actorId: input.actorId,
    caseId: input.caseId,
    eventType: input.eventType,
    metadata: input.metadata ?? {},
    note: input.note,
    operationId: input.operationId,
  });
}

export async function listMatterOperationEventsByCaseId(input: {
  caseId: string;
  operationId?: string;
}): Promise<MatterOperationEventDto[]> {
  const db = createDrizzleDb();
  const whereClause = input.operationId
    ? and(
        eq(matterOperationEvents.caseId, input.caseId),
        eq(matterOperationEvents.operationId, input.operationId),
      )
    : eq(matterOperationEvents.caseId, input.caseId);
  const rows = await db
    .select()
    .from(matterOperationEvents)
    .where(whereClause)
    .orderBy(desc(matterOperationEvents.createdAt), desc(matterOperationEvents.id));

  return rows.map(toMatterOperationEventDto);
}
