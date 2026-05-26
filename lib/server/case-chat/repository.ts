import "server-only";

import type {
  CaseChatMessageDto,
  CaseChatMessageRole,
  CaseChatMessageStatus,
  CaseChatSummaryDto,
  CaseChatThreadDto,
  CaseChatTraceEvent,
} from "@/lib/contracts/case-chat";
import {
  caseChatMessageDtoSchema,
  caseChatSummaryDtoSchema,
  caseChatThreadDtoSchema,
} from "@/lib/contracts/case-chat";
import { createNeonSql } from "@/lib/server/adapters/neon";

function jsonb(value: unknown) {
  return JSON.stringify(value ?? {});
}

function toIsoDateTime(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

type ThreadRow = {
  case_id: string;
  created_at: Date | string;
  id: string;
  status: "active" | "archived";
  updated_at: Date | string;
  user_id: string;
};

type MessageRow = {
  case_id: string;
  content: string;
  context_trace: unknown;
  created_at: Date | string;
  id: string;
  input_tokens: number | string | null;
  model: string | null;
  output_tokens: number | string | null;
  provider: string | null;
  role: CaseChatMessageRole;
  status: CaseChatMessageStatus;
  thread_id: string;
  updated_at: Date | string;
  user_id: string;
};

type SummaryRow = {
  case_id: string;
  covered_through_message_id: string;
  created_at: Date | string;
  id: string;
  input_tokens: number | string | null;
  model: string | null;
  output_tokens: number | string | null;
  provider: string | null;
  summary: string;
  thread_id: string;
  token_estimate: number | string;
  user_id: string;
};

function toThreadDto(row: ThreadRow): CaseChatThreadDto {
  return caseChatThreadDtoSchema.parse({
    id: row.id,
    caseId: row.case_id,
    userId: row.user_id,
    status: row.status,
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

function toMessageDto(row: MessageRow): CaseChatMessageDto {
  return caseChatMessageDtoSchema.parse({
    id: row.id,
    threadId: row.thread_id,
    caseId: row.case_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    content: row.content,
    contextTrace: row.context_trace ?? [],
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens === null ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens === null ? null : Number(row.output_tokens),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

function toSummaryDto(row: SummaryRow): CaseChatSummaryDto {
  return caseChatSummaryDtoSchema.parse({
    id: row.id,
    threadId: row.thread_id,
    caseId: row.case_id,
    userId: row.user_id,
    coveredThroughMessageId: row.covered_through_message_id,
    summary: row.summary,
    tokenEstimate: Number(row.token_estimate),
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens === null ? null : Number(row.input_tokens),
    outputTokens: row.output_tokens === null ? null : Number(row.output_tokens),
    createdAt: toIsoDateTime(row.created_at),
  });
}

export async function getOrCreateCaseChatThread(input: {
  caseId: string;
  userId: string;
}): Promise<CaseChatThreadDto> {
  const sql = createNeonSql();
  const rows = await sql`
    insert into public.case_chat_threads (
      case_id,
      user_id
    )
    values (
      ${input.caseId},
      ${input.userId}
    )
    on conflict (case_id, user_id) do update
    set updated_at = public.case_chat_threads.updated_at
    returning
      id,
      case_id,
      user_id,
      status,
      created_at,
      updated_at
  `;
  const [row] = rows as ThreadRow[];

  return toThreadDto(row);
}

export async function insertCaseChatMessage(input: {
  caseId: string;
  content: string;
  contextTrace?: CaseChatTraceEvent[];
  role: CaseChatMessageRole;
  status?: CaseChatMessageStatus;
  threadId: string;
  userId: string;
}): Promise<CaseChatMessageDto> {
  const sql = createNeonSql();
  const rows = await sql`
    insert into public.case_chat_messages (
      thread_id,
      case_id,
      user_id,
      role,
      status,
      content,
      context_trace
    )
    values (
      ${input.threadId},
      ${input.caseId},
      ${input.userId},
      ${input.role},
      ${input.status ?? "completed"},
      ${input.content},
      ${jsonb(input.contextTrace ?? [])}::jsonb
    )
    returning
      id,
      thread_id,
      case_id,
      user_id,
      role,
      status,
      content,
      context_trace,
      provider,
      model,
      input_tokens,
      output_tokens,
      created_at,
      updated_at
  `;
  const [row] = rows as MessageRow[];

  return toMessageDto(row);
}

export async function updateCaseChatMessage(input: {
  content?: string;
  contextTrace?: CaseChatTraceEvent[];
  error?: Record<string, unknown> | null;
  inputTokens?: number | null;
  messageId: string;
  model?: string | null;
  outputTokens?: number | null;
  provider?: string | null;
  status: CaseChatMessageStatus;
}): Promise<CaseChatMessageDto> {
  const sql = createNeonSql();
  const rows = await sql`
    update public.case_chat_messages
    set
      status = ${input.status},
      content = coalesce(${input.content ?? null}, content),
      context_trace = coalesce(${input.contextTrace ? jsonb(input.contextTrace) : null}::jsonb, context_trace),
      provider = coalesce(${input.provider ?? null}, provider),
      model = coalesce(${input.model ?? null}, model),
      input_tokens = coalesce(${input.inputTokens ?? null}, input_tokens),
      output_tokens = coalesce(${input.outputTokens ?? null}, output_tokens),
      error = ${input.error ? jsonb(input.error) : null}::jsonb,
      updated_at = now()
    where id = ${input.messageId}
    returning
      id,
      thread_id,
      case_id,
      user_id,
      role,
      status,
      content,
      context_trace,
      provider,
      model,
      input_tokens,
      output_tokens,
      created_at,
      updated_at
  `;
  const [row] = rows as MessageRow[];

  return toMessageDto(row);
}

export async function listCaseChatMessages(input: {
  afterMessageId?: string | null;
  threadId: string;
}): Promise<CaseChatMessageDto[]> {
  const sql = createNeonSql();
  const rows = await sql`
    select
      message.id,
      message.thread_id,
      message.case_id,
      message.user_id,
      message.role,
      message.status,
      message.content,
      message.context_trace,
      message.provider,
      message.model,
      message.input_tokens,
      message.output_tokens,
      message.created_at,
      message.updated_at
    from public.case_chat_messages message
    where message.thread_id = ${input.threadId}
      and message.status = 'completed'
      and (
        ${input.afterMessageId ?? null}::uuid is null
        or message.created_at > (
          select boundary.created_at
          from public.case_chat_messages boundary
          where boundary.id = ${input.afterMessageId}
          limit 1
        )
        or (
          message.created_at = (
            select boundary.created_at
            from public.case_chat_messages boundary
            where boundary.id = ${input.afterMessageId}
            limit 1
          )
          and message.id > ${input.afterMessageId ?? null}::uuid
        )
      )
    order by message.created_at asc, message.id asc
  `;

  return (rows as MessageRow[]).map(toMessageDto);
}

export async function getLatestCaseChatSummary(input: {
  threadId: string;
}): Promise<CaseChatSummaryDto | null> {
  const sql = createNeonSql();
  const rows = await sql`
    select
      id,
      thread_id,
      case_id,
      user_id,
      covered_through_message_id,
      summary,
      token_estimate,
      provider,
      model,
      input_tokens,
      output_tokens,
      created_at
    from public.case_chat_summaries
    where thread_id = ${input.threadId}
    order by created_at desc, id desc
    limit 1
  `;
  const [row] = rows as SummaryRow[];

  return row ? toSummaryDto(row) : null;
}

export async function insertCaseChatSummary(input: {
  caseId: string;
  coveredThroughMessageId: string;
  inputTokens?: number | null;
  model?: string | null;
  outputTokens?: number | null;
  provider?: string | null;
  summary: string;
  threadId: string;
  tokenEstimate: number;
  userId: string;
}): Promise<CaseChatSummaryDto> {
  const sql = createNeonSql();
  const rows = await sql`
    insert into public.case_chat_summaries (
      thread_id,
      case_id,
      user_id,
      covered_through_message_id,
      summary,
      token_estimate,
      provider,
      model,
      input_tokens,
      output_tokens
    )
    values (
      ${input.threadId},
      ${input.caseId},
      ${input.userId},
      ${input.coveredThroughMessageId},
      ${input.summary},
      ${input.tokenEstimate},
      ${input.provider ?? null},
      ${input.model ?? null},
      ${input.inputTokens ?? null},
      ${input.outputTokens ?? null}
    )
    returning
      id,
      thread_id,
      case_id,
      user_id,
      covered_through_message_id,
      summary,
      token_estimate,
      provider,
      model,
      input_tokens,
      output_tokens,
      created_at
  `;
  const [row] = rows as SummaryRow[];

  return toSummaryDto(row);
}
