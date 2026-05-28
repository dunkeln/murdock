import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import {
  caseActionTaskSchema,
  type CaseActionTask,
  type CaseActionTaskActor,
  type CaseActionTaskKind,
  type CaseActionTaskSource,
  type CaseActionTaskStatus,
} from "@/lib/contracts/case-action-tasks";
import type { ReviewWorkItemPriority } from "@/lib/contracts/review-work-item";
import { createDrizzleDb } from "@/lib/server/adapters/neon";
import { caseActionTasks } from "@/lib/server/db/schema/matter-operations";
import { toIso } from "@/lib/server/mcp/v1/projections";

type CaseActionTaskRow = typeof caseActionTasks.$inferSelect;

function toCaseActionTask(row: CaseActionTaskRow): CaseActionTask {
  return caseActionTaskSchema.parse({
    actor: row.actor,
    caseId: row.caseId,
    connectorHint: row.connectorHint,
    createdAt: toIso(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    kind: row.kind,
    priority: row.priority,
    provenanceRefs: row.provenanceRefs,
    sourceReviewRefs: row.sourceReviewRefs,
    sourceSpanRefs: row.sourceSpanRefs,
    sourceType: row.sourceType,
    status: row.status,
    taskKey: row.taskKey,
    title: row.title,
    updatedAt: toIso(row.updatedAt),
  });
}

export async function listCaseActionTasks(input: {
  caseId: string;
  includeDone?: boolean;
  limit?: number;
}): Promise<CaseActionTask[]> {
  const db = createDrizzleDb();
  const includeDone = input.includeDone ?? false;
  const whereClause = includeDone
    ? eq(caseActionTasks.caseId, input.caseId)
    : and(
        eq(caseActionTasks.caseId, input.caseId),
        sql`${caseActionTasks.status} not in ('done', 'dismissed')`,
      );
  const rows = await db
    .select()
    .from(caseActionTasks)
    .where(whereClause)
    .orderBy(
      sql`
        case ${caseActionTasks.priority}
          when 'critical' then 0
          when 'high' then 1
          when 'medium' then 2
          else 3
        end
      `,
      desc(caseActionTasks.updatedAt),
      desc(caseActionTasks.id),
    )
    .limit(input.limit ?? 50);

  return rows.map(toCaseActionTask);
}

export async function upsertCaseActionTask(input: {
  actor: CaseActionTaskActor;
  caseId: string;
  connectorHint?: string | null;
  createdBy?: string | null;
  description: string;
  kind: CaseActionTaskKind;
  priority: ReviewWorkItemPriority;
  provenanceRefs?: unknown[];
  sourceReviewRefs?: string[];
  sourceSpanRefs?: string[];
  sourceType: CaseActionTaskSource;
  status?: CaseActionTaskStatus;
  taskKey: string;
  title: string;
}): Promise<CaseActionTask> {
  const db = createDrizzleDb();
  const [row] = await db
    .insert(caseActionTasks)
    .values({
      actor: input.actor,
      caseId: input.caseId,
      connectorHint: input.connectorHint ?? null,
      createdBy: input.createdBy ?? null,
      description: input.description,
      kind: input.kind,
      priority: input.priority,
      provenanceRefs: input.provenanceRefs ?? [],
      sourceReviewRefs: input.sourceReviewRefs ?? [],
      sourceSpanRefs: input.sourceSpanRefs ?? [],
      sourceType: input.sourceType,
      status: input.status ?? "queued",
      taskKey: input.taskKey,
      title: input.title,
    })
    .onConflictDoUpdate({
      target: [caseActionTasks.caseId, caseActionTasks.taskKey],
      set: {
        connectorHint: sql`excluded.connector_hint`,
        actor: sql`excluded.actor`,
        description: sql`excluded.description`,
        kind: sql`excluded.kind`,
        priority: sql`excluded.priority`,
        provenanceRefs: sql`excluded.provenance_refs`,
        sourceReviewRefs: sql`excluded.source_review_refs`,
        sourceSpanRefs: sql`excluded.source_span_refs`,
        sourceType: sql`excluded.source_type`,
        status: sql`excluded.status`,
        title: sql`excluded.title`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  if (!row) {
    throw new Error("Case action task was not written.");
  }

  return toCaseActionTask(row);
}

export async function updateCaseActionTaskStatus(input: {
  caseId: string;
  status: CaseActionTaskStatus;
  taskKey: string;
}): Promise<CaseActionTask | null> {
  const db = createDrizzleDb();
  const [row] = await db
    .update(caseActionTasks)
    .set({
      status: input.status,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(caseActionTasks.caseId, input.caseId),
        eq(caseActionTasks.taskKey, input.taskKey),
      ),
    )
    .returning();

  return row ? toCaseActionTask(row) : null;
}
