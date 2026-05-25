import "server-only";

import {
  type CreateCaseInput,
  type CasePriority,
  type CaseStatus,
  type CaseSummaryDto,
  type CaseType,
  createCaseInputSchema,
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

function slugifyCaseTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "case";
}

function createCaseSlug(title: string): string {
  return `${slugifyCaseTitle(title)}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createCaseByUser(input: {
  userId: string;
  data: CreateCaseInput;
}): Promise<CaseSummaryDto> {
  const parsedData = createCaseInputSchema.parse(input.data);
  const sql = createNeonSql();
  const rows = await sql`
    insert into public.cases (
      user_id,
      slug,
      title,
      type,
      client_name,
      status,
      priority
    )
    values (
      ${input.userId},
      ${createCaseSlug(parsedData.title)},
      ${parsedData.title},
      ${parsedData.type},
      ${parsedData.clientName},
      ${parsedData.status},
      ${parsedData.priority}
    )
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

  return toCaseSummaryDto(row);
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

export async function getCaseSummaryByUserAndId(input: {
  caseId: string;
  userId: string;
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
      and id = ${input.caseId}
    limit 1
  `;
  const [row] = rows as CaseSummaryRow[];

  return row ? toCaseSummaryDto(row) : null;
}

export async function deleteCaseByUser(input: {
  caseId: string;
  userId: string;
}): Promise<CaseSummaryDto | null> {
  const sql = createNeonSql();
  const rows = await sql`
    delete from public.cases
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
