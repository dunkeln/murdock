import {
  type CaseWorkspaceChronologyEventDto,
  type CaseWorkspaceFactDto,
  type CaseWorkspaceIssueDto,
  type CaseWorkspaceSourceDocumentDto,
  type CaseWorkspaceSourceKind,
  type CaseWorkspaceSourceSpanDto,
  caseWorkspaceChronologyEventDtoSchema,
  caseWorkspaceFactDtoSchema,
  caseWorkspaceIssueDtoSchema,
  caseWorkspaceSourceDocumentDtoSchema,
  caseWorkspaceSourceSpanDtoSchema,
} from "@/lib/contracts/case-workspace";
import type { OcrConversionStatus } from "@/lib/contracts/ocr-conversions";
import {
  type ReviewActionKind,
  type ReviewActionPriority,
} from "@/lib/contracts/review-reducer";
import {
  reviewWorkItemProvenanceRefSchema,
  reviewWorkItemSchema,
  type ReviewWorkItem,
  type ReviewWorkItemOrigin,
  type ReviewWorkItemProvenanceRef,
  type ReviewWorkItemStatus,
} from "@/lib/contracts/review-work-item";
import { sourceSpanProvenanceRefs } from "@/lib/review-work-items";

type DateValue = Date | string | null;

export type CaseWorkspaceSourceDocumentRow = {
  id: string;
  case_id: string;
  source_key: string;
  title: string;
  file_name: string;
  source_kind: CaseWorkspaceSourceKind;
  case_document_id: string | null;
  ocr_conversion_id: string | null;
  document_sha256: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  ocr_status: OcrConversionStatus | null;
  source_date: DateValue;
  received_at: DateValue;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CaseWorkspaceSourceSpanRow = {
  id: string;
  case_id: string;
  source_document_id: string;
  span_key: string;
  page_index: number | null;
  page_label: string | null;
  field_path: string | null;
  verbatim_excerpt: string;
  confidence: number | string | null;
  captured_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CaseWorkspaceFactRow = {
  id: string;
  case_id: string;
  fact_key: string;
  label: string;
  category: string;
  category_detail: string | null;
  value_type: CaseWorkspaceFactDto["valueType"];
  stated_value: string | null;
  normalized_value: string | null;
  calculated_value: string | null;
  effective_at: DateValue;
  observed_at: DateValue;
  is_current: boolean;
  confidence: number | string | null;
  source_span_ids: string[] | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CaseWorkspaceChronologyEventRow = {
  id: string;
  case_id: string;
  event_key: string;
  event_kind: CaseWorkspaceChronologyEventDto["eventKind"];
  title: string;
  description: string | null;
  occurred_at: DateValue;
  occurred_at_precision: CaseWorkspaceChronologyEventDto["occurredAtPrecision"];
  confidence: number | string | null;
  source_span_ids: string[] | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CaseWorkspaceIssueRow = {
  id: string;
  case_id: string;
  issue_key: string;
  issue_type: CaseWorkspaceIssueDto["issueType"];
  severity: CaseWorkspaceIssueDto["severity"];
  status: CaseWorkspaceIssueDto["status"];
  title: string;
  description: string | null;
  provenance_summary: string | null;
  related_fact_ids: string[] | string | null;
  related_event_ids: string[] | string | null;
  source_span_ids: string[] | string | null;
  detected_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

export type CaseReviewActionRow = {
  work_item_key: string;
  review_prompt: string;
  blocking: boolean;
  case_id: string;
  created_at: Date | string;
  id: string;
  kind: ReviewActionKind;
  priority: ReviewActionPriority;
  provenance_refs: ReviewWorkItemProvenanceRef[] | string | null;
  source_run_id: string | null;
  source_type: ReviewWorkItemOrigin["sourceType"];
  resolved_at: DateValue;
  source_span_ids: string[] | string | null;
  status: ReviewWorkItemStatus;
  summary: string;
  title: string;
  updated_at: Date | string;
};

function toIsoDateTime(value: Date | string): string;
function toIsoDateTime(value: DateValue): string | null;
function toIsoDateTime(value: DateValue): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value);
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

function toProvenanceRefs(
  value: ReviewWorkItemProvenanceRef[] | string | null,
): ReviewWorkItemProvenanceRef[] {
  const rawValue = typeof value === "string" ? JSON.parse(value) as unknown : value;

  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue.flatMap((item) => {
    const parsed = reviewWorkItemProvenanceRefSchema.safeParse(item);

    return parsed.success ? [parsed.data] : [];
  });
}

function uniqueProvenanceRefs(
  refs: ReviewWorkItemProvenanceRef[],
): ReviewWorkItemProvenanceRef[] {
  const seen = new Set<string>();

  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function toCaseWorkspaceSourceDocumentDto(
  row: CaseWorkspaceSourceDocumentRow
): CaseWorkspaceSourceDocumentDto {
  return caseWorkspaceSourceDocumentDtoSchema.parse({
    id: row.id,
    caseId: row.case_id,
    sourceKey: row.source_key,
    title: row.title,
    fileName: row.file_name,
    sourceKind: row.source_kind,
    caseDocumentId: row.case_document_id,
    ocrConversionId: row.ocr_conversion_id,
    documentSha256: row.document_sha256,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    ocrStatus: row.ocr_status,
    sourceDate: toIsoDateTime(row.source_date),
    receivedAt: toIsoDateTime(row.received_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

export function toCaseWorkspaceSourceSpanDto(
  row: CaseWorkspaceSourceSpanRow
): CaseWorkspaceSourceSpanDto {
  return caseWorkspaceSourceSpanDtoSchema.parse({
    id: row.id,
    caseId: row.case_id,
    sourceDocumentId: row.source_document_id,
    spanKey: row.span_key,
    pageIndex: row.page_index,
    pageLabel: row.page_label,
    fieldPath: row.field_path,
    verbatimExcerpt: row.verbatim_excerpt,
    confidence: toNumber(row.confidence),
    capturedAt: toIsoDateTime(row.captured_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

export function toCaseWorkspaceFactDto(
  row: CaseWorkspaceFactRow
): CaseWorkspaceFactDto {
  return caseWorkspaceFactDtoSchema.parse({
    id: row.id,
    caseId: row.case_id,
    factKey: row.fact_key,
    label: row.label,
    category: row.category,
    categoryDetail: row.category_detail,
    valueType: row.value_type,
    statedValue: row.stated_value,
    normalizedValue: row.normalized_value,
    calculatedValue: row.calculated_value,
    effectiveAt: toIsoDateTime(row.effective_at),
    observedAt: toIsoDateTime(row.observed_at),
    isCurrent: row.is_current,
    confidence: toNumber(row.confidence),
    sourceSpanIds: toUuidArray(row.source_span_ids),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

export function toCaseWorkspaceChronologyEventDto(
  row: CaseWorkspaceChronologyEventRow
): CaseWorkspaceChronologyEventDto {
  return caseWorkspaceChronologyEventDtoSchema.parse({
    id: row.id,
    caseId: row.case_id,
    eventKey: row.event_key,
    eventKind: row.event_kind,
    title: row.title,
    description: row.description,
    occurredAt: toIsoDateTime(row.occurred_at),
    occurredAtPrecision: row.occurred_at_precision,
    confidence: toNumber(row.confidence),
    sourceSpanIds: toUuidArray(row.source_span_ids),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

export function toCaseWorkspaceIssueDto(
  row: CaseWorkspaceIssueRow
): CaseWorkspaceIssueDto {
  return caseWorkspaceIssueDtoSchema.parse({
    id: row.id,
    caseId: row.case_id,
    issueKey: row.issue_key,
    issueType: row.issue_type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    provenanceSummary: row.provenance_summary,
    relatedFactIds: toUuidArray(row.related_fact_ids),
    relatedEventIds: toUuidArray(row.related_event_ids),
    sourceSpanIds: toUuidArray(row.source_span_ids),
    detectedAt: toIsoDateTime(row.detected_at),
    createdAt: toIsoDateTime(row.created_at),
    updatedAt: toIsoDateTime(row.updated_at),
  });
}

export function toReviewWorkItem(
  row: CaseReviewActionRow,
): ReviewWorkItem {
  const sourceSpanIds = toUuidArray(row.source_span_ids);
  const provenanceRefs = uniqueProvenanceRefs([
    ...toProvenanceRefs(row.provenance_refs),
    ...sourceSpanProvenanceRefs(sourceSpanIds),
  ]);

  return reviewWorkItemSchema.parse({
    blocking: row.blocking,
    caseId: row.case_id,
    createdAt: toIsoDateTime(row.created_at),
    id: row.id,
    key: row.work_item_key,
    kind: {
      code: row.kind,
      family: row.kind,
    },
    origin: {
      sourceRunId: row.source_run_id,
      sourceType: row.source_type,
    },
    priority: row.priority,
    provenanceRefs,
    resolvedAt: toIsoDateTime(row.resolved_at),
    reviewPrompt: row.review_prompt,
    sourceSpanIds,
    status: row.status,
    summary: row.summary,
    title: row.title,
    updatedAt: toIsoDateTime(row.updated_at),
  });
}
