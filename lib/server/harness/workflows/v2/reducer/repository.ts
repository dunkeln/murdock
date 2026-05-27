import "server-only";

import type {
  MaterializedReviewAction,
  ReviewReducerRunStatus,
} from "@/lib/contracts/review-reducer";
import { createNeonSql } from "@/lib/server/adapters/neon";

type JsonRecord = Record<string, unknown>;

function jsonb(value: unknown) {
  return JSON.stringify(value ?? {});
}

export async function startReviewReducerRun(input: {
  caseId: string;
  harnessRunId: string;
  reducerVersion: string;
  runId: string;
}) {
  const sql = createNeonSql();
  const rows = await sql`
    insert into public.case_review_reducer_runs (
      id,
      case_id,
      harness_run_id,
      reducer_version,
      status,
      started_at,
      completed_at
    )
    values (
      ${input.runId},
      ${input.caseId},
      ${input.harnessRunId},
      ${input.reducerVersion},
      'running',
      now(),
      null
    )
    on conflict (harness_run_id, reducer_version) do update
    set
      status = 'running',
      error = null,
      stats = '{}'::jsonb,
      provider = null,
      model = null,
      input_tokens = null,
      output_tokens = null,
      started_at = now(),
      completed_at = null,
      updated_at = now()
    returning id
  `;
  const [row] = rows as Array<{ id: string }>;

  return row?.id ?? input.runId;
}

export async function finishReviewReducerRun(input: {
  error?: unknown;
  model?: string | null;
  provider?: string | null;
  runId: string;
  stats: JsonRecord;
  status: ReviewReducerRunStatus;
  usage?: { inputTokens: number | null; outputTokens: number | null } | null;
}) {
  const sql = createNeonSql();

  await sql`
    update public.case_review_reducer_runs
    set
      status = ${input.status},
      provider = ${input.provider ?? null},
      model = ${input.model ?? null},
      input_tokens = ${input.usage?.inputTokens ?? null},
      output_tokens = ${input.usage?.outputTokens ?? null},
      stats = ${jsonb(input.stats)}::jsonb,
      error = ${input.error ? jsonb(input.error) : null}::jsonb,
      completed_at = now(),
      updated_at = now()
    where id = ${input.runId}
  `;
}

export async function upsertReviewActions(input: {
  actions: MaterializedReviewAction[];
  caseId: string;
  reducerRunId: string;
}) {
  const sql = createNeonSql();

  await Promise.all(
    input.actions.map((action) =>
      sql`
        insert into public.case_review_work_items (
          case_id,
          source_run_id,
          source_type,
          work_item_key,
          kind,
          priority,
          blocking,
          status,
          title,
          summary,
          review_prompt,
          source_span_ids,
          provenance_refs
        )
        values (
          ${input.caseId},
          ${input.reducerRunId},
          ${action.origin.sourceType},
          ${action.key},
          ${action.kind.family},
          ${action.priority},
          ${action.blocking},
          'open',
          ${action.title},
          ${action.summary},
          ${action.reviewPrompt},
          ${action.sourceSpanIds},
          ${jsonb(action.provenanceRefs)}::jsonb
        )
        on conflict (case_id, work_item_key) do update
        set
          source_run_id = excluded.source_run_id,
          source_type = excluded.source_type,
          kind = excluded.kind,
          priority = excluded.priority,
          blocking = excluded.blocking,
          title = excluded.title,
          summary = excluded.summary,
          review_prompt = excluded.review_prompt,
          source_span_ids = excluded.source_span_ids,
          provenance_refs = excluded.provenance_refs,
          updated_at = now()
      `,
    ),
  );
}

export async function recordReviewActionEvent(input: {
  actionId: string;
  actorId: string | null;
  caseId: string;
  eventType: "comment" | "resolved" | "dismissed" | "reopened";
  note: string | null;
}) {
  const sql = createNeonSql();

  await sql`
    insert into public.case_review_work_item_events (
      case_id,
      work_item_id,
      event_type,
      actor_id,
      note
    )
    values (
      ${input.caseId},
      ${input.actionId},
      ${input.eventType},
      ${input.actorId},
      ${input.note}
    )
  `;
}
