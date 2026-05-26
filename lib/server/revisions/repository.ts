import "server-only";

import type {
  DocumentFamilyDto,
  DocumentRevisionClaimDto,
  DocumentRevisionSummaryDto,
  DocumentVersionDto,
} from "@/lib/contracts/document-revisions";
import {
  documentFamilyDtoSchema,
  documentRevisionClaimDtoSchema,
  documentRevisionSummaryDtoSchema,
  documentVersionDtoSchema,
} from "@/lib/contracts/document-revisions";
import { createNeonSql } from "@/lib/server/adapters/neon";

import type { RevisionClaimInput } from "./claims";

type DateValue = Date | string | null;

type DocumentFamilyRow = {
  case_id: string;
  created_at: Date | string;
  family_key: string;
  id: string;
  label: string;
  updated_at: Date | string;
};

type DocumentVersionRow = {
  case_document_id: string | null;
  case_id: string;
  created_at: Date | string;
  document_family_id: string;
  id: string;
  label: string;
  snapshot_hash: string;
  snapshot_json: Record<string, unknown>;
  snapshot_text: string;
  source_document_id: string;
  updated_at: Date | string;
  uploaded_at: DateValue;
  version_index: number;
};

type DocumentRevisionClaimRow = {
  after_source_span_ids: string[] | string | null;
  after_value: unknown | null;
  before_source_span_ids: string[] | string | null;
  before_value: unknown | null;
  case_id: string;
  change_type: string;
  confidence: string;
  created_at: Date | string;
  document_family_id: string;
  field_label: string;
  field_path: string;
  from_document_version_id: string;
  id: string;
  status: string;
  to_document_version_id: string;
  updated_at: Date | string;
};

type DocumentRevisionSummaryRow = DocumentRevisionClaimRow & {
  document_label: string;
  from_source_document_id: string;
  from_version_label: string;
  to_source_document_id: string;
  to_version_label: string;
};

function toIsoDateTime(value: Date | string): string;
function toIsoDateTime(value: DateValue): string | null;
function toIsoDateTime(value: DateValue): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toUuidArray(value: string[] | string | null): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  return value
    .replace(/[{}]/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toDocumentFamilyDto(row: DocumentFamilyRow): DocumentFamilyDto {
  return documentFamilyDtoSchema.parse({
    caseId: row.case_id,
    createdAt: toIsoDateTime(row.created_at),
    familyKey: row.family_key,
    id: row.id,
    label: row.label,
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

function toDocumentVersionDto(row: DocumentVersionRow): DocumentVersionDto {
  return documentVersionDtoSchema.parse({
    caseDocumentId: row.case_document_id,
    caseId: row.case_id,
    createdAt: toIsoDateTime(row.created_at),
    documentFamilyId: row.document_family_id,
    id: row.id,
    label: row.label,
    snapshotHash: row.snapshot_hash,
    snapshotJson: row.snapshot_json,
    snapshotText: row.snapshot_text,
    sourceDocumentId: row.source_document_id,
    updatedAt: toIsoDateTime(row.updated_at),
    uploadedAt: toIsoDateTime(row.uploaded_at),
    versionIndex: row.version_index,
  });
}

function toDocumentRevisionClaimDto(
  row: DocumentRevisionClaimRow,
): DocumentRevisionClaimDto {
  return documentRevisionClaimDtoSchema.parse({
    afterSourceSpanIds: toUuidArray(row.after_source_span_ids),
    afterValue: row.after_value,
    beforeSourceSpanIds: toUuidArray(row.before_source_span_ids),
    beforeValue: row.before_value,
    caseId: row.case_id,
    changeType: row.change_type,
    confidence: row.confidence,
    createdAt: toIsoDateTime(row.created_at),
    documentFamilyId: row.document_family_id,
    fieldLabel: row.field_label,
    fieldPath: row.field_path,
    fromDocumentVersionId: row.from_document_version_id,
    id: row.id,
    status: row.status,
    toDocumentVersionId: row.to_document_version_id,
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

export async function upsertDocumentFamily(input: {
  caseId: string;
  familyKey: string;
  label: string;
}): Promise<DocumentFamilyDto> {
  const sql = createNeonSql();
  const rows = await sql`
    insert into public.document_families (
      case_id,
      family_key,
      label
    )
    values (
      ${input.caseId},
      ${input.familyKey},
      ${input.label}
    )
    on conflict (case_id, family_key) do update
    set
      label = excluded.label,
      updated_at = now()
    returning
      id,
      case_id,
      family_key,
      label,
      created_at,
      updated_at
  `;
  const [row] = rows as DocumentFamilyRow[];

  return toDocumentFamilyDto(row);
}

export async function upsertDocumentVersion(input: {
  caseDocumentId: string | null;
  caseId: string;
  documentFamilyId: string;
  label: string;
  snapshotHash: string;
  snapshotJson: Record<string, unknown>;
  snapshotText: string;
  sourceDocumentId: string;
  uploadedAt: string | null;
}): Promise<DocumentVersionDto> {
  const sql = createNeonSql();
  const rows = await sql`
    with next_version as (
      select coalesce(max(version_index), 0) + 1 as version_index
      from public.document_versions
      where document_family_id = ${input.documentFamilyId}
    )
    insert into public.document_versions (
      case_id,
      document_family_id,
      source_document_id,
      case_document_id,
      version_index,
      label,
      snapshot_json,
      snapshot_text,
      snapshot_hash,
      uploaded_at
    )
    values (
      ${input.caseId},
      ${input.documentFamilyId},
      ${input.sourceDocumentId},
      ${input.caseDocumentId},
      (select version_index from next_version),
      ${input.label},
      ${JSON.stringify(input.snapshotJson)}::jsonb,
      ${input.snapshotText},
      ${input.snapshotHash},
      ${input.uploadedAt}
    )
    on conflict (source_document_id) do update
    set
      case_document_id = excluded.case_document_id,
      label = excluded.label,
      snapshot_json = excluded.snapshot_json,
      snapshot_text = excluded.snapshot_text,
      snapshot_hash = excluded.snapshot_hash,
      uploaded_at = excluded.uploaded_at,
      updated_at = now()
    returning
      id,
      case_id,
      document_family_id,
      source_document_id,
      case_document_id,
      version_index,
      label,
      snapshot_json,
      snapshot_text,
      snapshot_hash,
      uploaded_at,
      created_at,
      updated_at
  `;
  const [row] = rows as DocumentVersionRow[];

  return toDocumentVersionDto(row);
}

export async function getPreviousDocumentVersion(input: {
  documentFamilyId: string;
  versionIndex: number;
}): Promise<DocumentVersionDto | null> {
  const sql = createNeonSql();
  const rows = await sql`
    select
      id,
      case_id,
      document_family_id,
      source_document_id,
      case_document_id,
      version_index,
      label,
      snapshot_json,
      snapshot_text,
      snapshot_hash,
      uploaded_at,
      created_at,
      updated_at
    from public.document_versions
    where document_family_id = ${input.documentFamilyId}
      and version_index < ${input.versionIndex}
    order by version_index desc
    limit 1
  `;
  const [row] = rows as DocumentVersionRow[];

  return row ? toDocumentVersionDto(row) : null;
}

export async function upsertDocumentRevisionClaims(
  claims: RevisionClaimInput[],
): Promise<DocumentRevisionClaimDto[]> {
  if (claims.length === 0) {
    return [];
  }

  const sql = createNeonSql();
  const results = await Promise.all(
    claims.map(async (claim) => {
      const rows = await sql`
        insert into public.document_revision_claims (
          case_id,
          document_family_id,
          from_document_version_id,
          to_document_version_id,
          field_path,
          field_label,
          change_type,
          before_value,
          after_value,
          before_source_span_ids,
          after_source_span_ids,
          confidence
        )
        values (
          ${claim.caseId},
          ${claim.documentFamilyId},
          ${claim.fromDocumentVersionId},
          ${claim.toDocumentVersionId},
          ${claim.fieldPath},
          ${claim.fieldLabel},
          ${claim.changeType},
          ${JSON.stringify(claim.beforeValue)}::jsonb,
          ${JSON.stringify(claim.afterValue)}::jsonb,
          ${claim.beforeSourceSpanIds},
          ${claim.afterSourceSpanIds},
          ${claim.confidence}
        )
        on conflict (
          from_document_version_id,
          to_document_version_id,
          field_path,
          change_type
        ) do update
        set
          field_label = excluded.field_label,
          before_value = excluded.before_value,
          after_value = excluded.after_value,
          before_source_span_ids = excluded.before_source_span_ids,
          after_source_span_ids = excluded.after_source_span_ids,
          confidence = excluded.confidence,
          updated_at = now()
        returning
          id,
          case_id,
          document_family_id,
          from_document_version_id,
          to_document_version_id,
          field_path,
          field_label,
          change_type,
          before_value,
          after_value,
          before_source_span_ids,
          after_source_span_ids,
          confidence,
          status,
          created_at,
          updated_at
      `;
      const [row] = rows as DocumentRevisionClaimRow[];

      return toDocumentRevisionClaimDto(row);
    }),
  );

  return results;
}

export async function getDocumentRevisionSummariesByCaseId(input: {
  caseId: string;
}): Promise<DocumentRevisionSummaryDto[]> {
  const sql = createNeonSql();
  const rows = await sql`
    select
      claim.id,
      claim.case_id,
      claim.document_family_id,
      claim.from_document_version_id,
      claim.to_document_version_id,
      claim.field_path,
      claim.field_label,
      claim.change_type,
      claim.before_value,
      claim.after_value,
      claim.before_source_span_ids,
      claim.after_source_span_ids,
      claim.confidence,
      claim.status,
      claim.created_at,
      claim.updated_at,
      family.label as document_label,
      from_version.label as from_version_label,
      from_version.source_document_id as from_source_document_id,
      to_version.label as to_version_label,
      to_version.source_document_id as to_source_document_id
    from public.document_revision_claims claim
    join public.document_families family
      on family.id = claim.document_family_id
    join public.document_versions from_version
      on from_version.id = claim.from_document_version_id
    join public.document_versions to_version
      on to_version.id = claim.to_document_version_id
    where claim.case_id = ${input.caseId}
      and claim.status <> 'dismissed'
    order by
      family.updated_at desc,
      to_version.version_index desc,
      claim.created_at desc,
      claim.id desc
  `;
  const summaries = new Map<string, DocumentRevisionSummaryDto>();

  for (const row of rows as DocumentRevisionSummaryRow[]) {
    const key = [
      row.document_family_id,
      row.from_document_version_id,
      row.to_document_version_id,
    ].join(":");
    const claim = toDocumentRevisionClaimDto(row);
    const current = summaries.get(key);

    if (current) {
      current.claims.push(claim);
      continue;
    }

    summaries.set(
      key,
      documentRevisionSummaryDtoSchema.parse({
        claims: [claim],
        documentFamilyId: row.document_family_id,
        documentLabel: row.document_label,
        fromSourceDocumentId: row.from_source_document_id,
        fromVersionLabel: row.from_version_label,
        toSourceDocumentId: row.to_source_document_id,
        toVersionLabel: row.to_version_label,
      }),
    );
  }

  return Array.from(summaries.values());
}
