import "server-only";

import {
  type CasePriority,
  type CaseStatus,
  type CaseSummaryDto,
  type CaseType,
  caseSummaryDtoSchema,
} from "@/lib/contracts/cases";
import { createNeonSql } from "@/lib/server/adapters/neon";

type CaseSummaryRow = {
  id: string;
  slug: string;
  title: string;
  type: CaseType;
  client_name: string | null;
  status: CaseStatus;
  priority: CasePriority;
  next_action: string | null;
  next_deadline_at: Date | string | null;
  updated_at: Date | string;
};

function toIsoDateTime(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toCaseSummaryDto(row: CaseSummaryRow): CaseSummaryDto {
  return caseSummaryDtoSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    clientName: row.client_name,
    status: row.status,
    priority: row.priority,
    nextAction: row.next_action,
    nextDeadlineAt: toIsoDateTime(row.next_deadline_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

export async function listCaseSummariesByUser(input: {
  userId: string;
  limit?: number;
}): Promise<CaseSummaryDto[]> {
  const sql = createNeonSql();
  const rows = await sql`
    select
      id,
      slug,
      title,
      type,
      client_name,
      status,
      priority,
      next_action,
      next_deadline_at,
      updated_at
    from public.cases
    where user_id = ${input.userId}
    order by updated_at desc, id desc
    limit ${input.limit ?? 25}
  `;

  return (rows as CaseSummaryRow[]).map(toCaseSummaryDto);
}

export async function getCaseSummaryByUserAndSlug(input: {
  userId: string;
  slug: string;
}): Promise<CaseSummaryDto | null> {
  const sql = createNeonSql();
  const rows = await sql`
    select
      id,
      slug,
      title,
      type,
      client_name,
      status,
      priority,
      next_action,
      next_deadline_at,
      updated_at
    from public.cases
    where user_id = ${input.userId}
      and slug = ${input.slug}
    limit 1
  `;
  const [row] = rows as CaseSummaryRow[];

  return row ? toCaseSummaryDto(row) : null;
}

export async function updateCaseTitleByUser(input: {
  userId: string;
  caseId: string;
  title: string;
}): Promise<CaseSummaryDto | null> {
  const sql = createNeonSql();
  const rows = await sql`
    update public.cases
    set
      title = ${input.title},
      updated_at = now()
    where user_id = ${input.userId}
      and id = ${input.caseId}
    returning
      id,
      slug,
      title,
      type,
      client_name,
      status,
      priority,
      next_action,
      next_deadline_at,
      updated_at
  `;
  const [row] = rows as CaseSummaryRow[];

  return row ? toCaseSummaryDto(row) : null;
}
