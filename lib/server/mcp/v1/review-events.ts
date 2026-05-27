import "server-only";

import { createNeonSql } from "@/lib/server/adapters/neon";
import { MurdockMcpServiceError } from "@/lib/server/mcp/v1/errors";

export async function recordReviewActionEvent(input: {
  actionId: string;
  actorId: string | null;
  caseId: string;
  eventType: "comment" | "resolved" | "dismissed" | "reopened";
  note: string | null;
}) {
  const sql = createNeonSql();
  const status =
    input.eventType === "resolved" || input.eventType === "dismissed"
      ? input.eventType
      : input.eventType === "reopened"
        ? "open"
        : null;
  const rows = await sql`
    with action_update as (
      update public.case_review_work_items
      set
        status = coalesce(${status}, status),
        resolved_at = case
          when ${input.eventType} = 'resolved' then now()
          when ${input.eventType} = 'reopened' then null
          else resolved_at
        end,
        updated_at = now()
      where id = ${input.actionId}
        and case_id = ${input.caseId}
      returning
        id,
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
        provenance_refs,
        resolved_at,
        created_at,
        updated_at
    ),
    event_insert as (
      insert into public.case_review_work_item_events (
        case_id,
        work_item_id,
        event_type,
        actor_id,
        note
      )
      select
        ${input.caseId},
        id,
        ${input.eventType},
        ${input.actorId},
        ${input.note}
      from action_update
      returning id
    )
    select *
    from action_update
  `;
  const [row] = rows as Array<Record<string, unknown>>;

  if (!row) {
    throw new MurdockMcpServiceError(
      "not_found",
      "Review action not found for this case.",
      false,
    );
  }

  return row;
}
