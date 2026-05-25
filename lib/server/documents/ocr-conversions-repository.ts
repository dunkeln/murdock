import "server-only";

import {
  type OcrConversionDto,
  type OcrConversionStatus,
  ocrConversionDtoSchema,
} from "@/lib/contracts/ocr-conversions";
import { createNeonSql } from "@/lib/server/adapters/neon";

type OcrConversionRow = {
  id: string;
  firm_id: string;
  document_sha256: string;
  provider: "mistral";
  provider_model: string;
  status: OcrConversionStatus;
  markdown: string | null;
  pages_processed: number | null;
  error_message: string | null;
  expires_at: Date | string;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIsoDateTime(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOcrConversionDto(row: OcrConversionRow): OcrConversionDto {
  return ocrConversionDtoSchema.parse({
    id: row.id,
    firmId: row.firm_id,
    documentSha256: row.document_sha256,
    provider: row.provider,
    providerModel: row.provider_model,
    status: row.status,
    markdown: row.markdown,
    pagesProcessed: row.pages_processed,
    errorMessage: row.error_message,
    expiresAt: toIsoDateTime(row.expires_at),
    deletedAt: toIsoDateTime(row.deleted_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

export async function getActiveOcrConversion(input: {
  documentSha256: string;
  firmId: string;
  provider: "mistral";
  providerModel: string;
}): Promise<OcrConversionDto | null> {
  const sql = createNeonSql();
  const rows = await sql`
    select
      id,
      firm_id,
      document_sha256,
      provider,
      provider_model,
      status,
      markdown,
      pages_processed,
      error_message,
      expires_at,
      deleted_at,
      created_at,
      updated_at
    from public.ocr_conversions
    where firm_id = ${input.firmId}
      and document_sha256 = ${input.documentSha256}
      and provider = ${input.provider}
      and provider_model = ${input.providerModel}
      and deleted_at is null
    limit 1
  `;
  const [row] = rows as OcrConversionRow[];

  return row ? toOcrConversionDto(row) : null;
}

export async function getOcrConversionsByFirmAndIds(input: {
  conversionIds: string[];
  firmId: string;
}): Promise<OcrConversionDto[]> {
  if (input.conversionIds.length === 0) {
    return [];
  }

  const sql = createNeonSql();
  const rows = await sql`
    select
      id,
      firm_id,
      document_sha256,
      provider,
      provider_model,
      status,
      markdown,
      pages_processed,
      error_message,
      expires_at,
      deleted_at,
      created_at,
      updated_at
    from public.ocr_conversions
    where firm_id = ${input.firmId}
      and id = any(${input.conversionIds})
      and deleted_at is null
    order by created_at asc, id asc
  `;

  return (rows as OcrConversionRow[]).map(toOcrConversionDto);
}

export async function insertProcessingOcrConversion(input: {
  documentSha256: string;
  firmId: string;
  provider: "mistral";
  providerModel: string;
}): Promise<OcrConversionDto | null> {
  const sql = createNeonSql();
  const rows = await sql`
    insert into public.ocr_conversions (
      firm_id,
      document_sha256,
      provider,
      provider_model,
      status,
      markdown,
      pages_processed,
      error_message,
      expires_at
    )
    values (
      ${input.firmId},
      ${input.documentSha256},
      ${input.provider},
      ${input.providerModel},
      'processing',
      null,
      null,
      null,
      now() + interval '2 days'
    )
    on conflict (
      firm_id,
      document_sha256,
      provider,
      provider_model
    )
    where deleted_at is null
    do nothing
    returning
      id,
      firm_id,
      document_sha256,
      provider,
      provider_model,
      status,
      markdown,
      pages_processed,
      error_message,
      expires_at,
      deleted_at,
      created_at,
      updated_at
  `;
  const [row] = rows as OcrConversionRow[];

  return row ? toOcrConversionDto(row) : null;
}

export async function claimRefreshableOcrConversion(input: {
  documentSha256: string;
  firmId: string;
  provider: "mistral";
  providerModel: string;
}): Promise<OcrConversionDto | null> {
  const sql = createNeonSql();
  const rows = await sql`
    update public.ocr_conversions
    set
      status = 'processing',
      markdown = null,
      pages_processed = null,
      error_message = null,
      expires_at = now() + interval '2 days',
      updated_at = now()
    where firm_id = ${input.firmId}
      and document_sha256 = ${input.documentSha256}
      and provider = ${input.provider}
      and provider_model = ${input.providerModel}
      and deleted_at is null
      and (
        status = 'pending'
        or (status = 'ready' and markdown is null)
        or expires_at <= now()
      )
    returning
      id,
      firm_id,
      document_sha256,
      provider,
      provider_model,
      status,
      markdown,
      pages_processed,
      error_message,
      expires_at,
      deleted_at,
      created_at,
      updated_at
  `;
  const [row] = rows as OcrConversionRow[];

  return row ? toOcrConversionDto(row) : null;
}

export async function markOcrConversionReady(input: {
  conversionId: string;
  markdown: string;
  pagesProcessed: number;
}): Promise<OcrConversionDto> {
  const sql = createNeonSql();
  const rows = await sql`
    update public.ocr_conversions
    set
      status = 'ready',
      markdown = ${input.markdown},
      pages_processed = ${input.pagesProcessed},
      error_message = null,
      expires_at = now() + interval '2 days',
      updated_at = now()
    where id = ${input.conversionId}
      and deleted_at is null
    returning
      id,
      firm_id,
      document_sha256,
      provider,
      provider_model,
      status,
      markdown,
      pages_processed,
      error_message,
      expires_at,
      deleted_at,
      created_at,
      updated_at
  `;
  const [row] = rows as OcrConversionRow[];

  return toOcrConversionDto(row);
}

export async function markOcrConversionFailed(input: {
  conversionId: string;
  errorMessage: string;
}): Promise<OcrConversionDto> {
  const sql = createNeonSql();
  const rows = await sql`
    update public.ocr_conversions
    set
      status = 'failed',
      markdown = null,
      pages_processed = null,
      error_message = ${input.errorMessage},
      expires_at = now() + interval '5 seconds',
      updated_at = now()
    where id = ${input.conversionId}
      and deleted_at is null
    returning
      id,
      firm_id,
      document_sha256,
      provider,
      provider_model,
      status,
      markdown,
      pages_processed,
      error_message,
      expires_at,
      deleted_at,
      created_at,
      updated_at
  `;
  const [row] = rows as OcrConversionRow[];

  return toOcrConversionDto(row);
}
