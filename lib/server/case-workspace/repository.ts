import "server-only";

import type {
  CaseWorkspaceChronologyEventDto,
  CaseWorkspaceFactDto,
  CaseWorkspaceIssueDto,
  CaseWorkspaceSourceDocumentDto,
  CaseWorkspaceSourceKind,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";
import { createNeonSql } from "@/lib/server/adapters/neon";
import {
  type CaseWorkspaceChronologyEventRow,
  type CaseWorkspaceFactRow,
  type CaseWorkspaceIssueRow,
  type CaseWorkspaceSourceDocumentRow,
  type CaseWorkspaceSourceSpanRow,
  toCaseWorkspaceChronologyEventDto,
  toCaseWorkspaceFactDto,
  toCaseWorkspaceIssueDto,
  toCaseWorkspaceSourceDocumentDto,
  toCaseWorkspaceSourceSpanDto,
} from "@/lib/server/case-workspace/mappers";

export type CaseWorkspaceRecords = {
  sourceDocuments: CaseWorkspaceSourceDocumentDto[];
  sourceSpans: CaseWorkspaceSourceSpanDto[];
  facts: CaseWorkspaceFactDto[];
  chronologyEvents: CaseWorkspaceChronologyEventDto[];
  issues: CaseWorkspaceIssueDto[];
};

export type UpsertSourceDocumentInput = {
  caseDocumentId: string | null;
  caseId: string;
  documentSha256: string | null;
  fileName: string;
  ocrConversionId: string | null;
  ocrStatus: CaseWorkspaceSourceDocumentDto["ocrStatus"];
  receivedAt: string | null;
  sourceDate: string | null;
  sourceKey: string;
  sourceKind: CaseWorkspaceSourceKind;
  title: string;
};

export type UpsertSourceSpanInput = {
  caseId: string;
  confidence: number | null;
  fieldPath: string | null;
  pageIndex: number | null;
  pageLabel: string | null;
  sourceDocumentId: string;
  spanKey: string;
  verbatimExcerpt: string;
};

export type UpsertFactInput = {
  calculatedValue: string | null;
  caseId: string;
  category: string;
  categoryDetail: string | null;
  confidence: number | null;
  effectiveAt: string | null;
  factKey: string;
  isCurrent: boolean;
  label: string;
  normalizedValue: string | null;
  observedAt: string | null;
  sourceSpanIds: string[];
  statedValue: string | null;
  valueType: CaseWorkspaceFactDto["valueType"];
};

export type UpsertChronologyEventInput = {
  caseId: string;
  confidence: number | null;
  description: string | null;
  eventKey: string;
  eventKind: CaseWorkspaceChronologyEventDto["eventKind"];
  occurredAt: string | null;
  occurredAtPrecision: CaseWorkspaceChronologyEventDto["occurredAtPrecision"];
  sourceSpanIds: string[];
  title: string;
};

export type UpsertIssueInput = {
  caseId: string;
  description: string | null;
  issueKey: string;
  issueType: CaseWorkspaceIssueDto["issueType"];
  provenanceSummary: string | null;
  relatedEventIds: string[];
  relatedFactIds: string[];
  severity: CaseWorkspaceIssueDto["severity"];
  sourceSpanIds: string[];
  status: CaseWorkspaceIssueDto["status"];
  title: string;
};

function isMissingCaseDocumentsTable(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  return (
    message.includes("relation") &&
    message.includes("public.case_documents") &&
    message.includes("does not exist")
  );
}

async function getSourceDocumentRows(
  sql: ReturnType<typeof createNeonSql>,
  caseId: string,
) {
  try {
    return await sql`
      select
        csd.id,
        csd.case_id,
        csd.source_key,
        csd.title,
        csd.file_name,
        csd.source_kind,
        csd.case_document_id,
        csd.ocr_conversion_id,
        csd.document_sha256,
        cd.mime_type,
        cd.size_bytes,
        csd.ocr_status,
        csd.source_date,
        csd.received_at,
        csd.created_at,
        csd.updated_at
      from public.case_source_documents csd
      left join public.case_documents cd on cd.id = csd.case_document_id
      where csd.case_id = ${caseId}
      order by coalesce(csd.source_date, csd.received_at, csd.created_at) asc, csd.id asc
    `;
  } catch (error) {
    if (!isMissingCaseDocumentsTable(error)) {
      throw error;
    }

    return sql`
      select
        csd.id,
        csd.case_id,
        csd.source_key,
        csd.title,
        csd.file_name,
        csd.source_kind,
        csd.case_document_id,
        csd.ocr_conversion_id,
        csd.document_sha256,
        null::text as mime_type,
        null::integer as size_bytes,
        csd.ocr_status,
        csd.source_date,
        csd.received_at,
        csd.created_at,
        csd.updated_at
      from public.case_source_documents csd
      where csd.case_id = ${caseId}
      order by coalesce(csd.source_date, csd.received_at, csd.created_at) asc, csd.id asc
    `;
  }
}

export async function getCaseWorkspaceRecordsByCaseId(input: {
  caseId: string;
}): Promise<CaseWorkspaceRecords> {
  const sql = createNeonSql();

  const [
    sourceDocumentRows,
    sourceSpanRows,
    factRows,
    chronologyEventRows,
    issueRows,
  ] = await Promise.all([
    getSourceDocumentRows(sql, input.caseId),
    sql`
      select
        id,
        case_id,
        source_document_id,
        span_key,
        page_index,
        page_label,
        field_path,
        verbatim_excerpt,
        confidence,
        captured_at,
        created_at,
        updated_at
      from public.case_source_spans
      where case_id = ${input.caseId}
      order by captured_at asc, id asc
    `,
    sql`
      select
        id,
        case_id,
        fact_key,
        label,
        category,
        category_detail,
        value_type,
        stated_value,
        normalized_value,
        calculated_value,
        effective_at,
        observed_at,
        is_current,
        confidence,
        source_span_ids,
        created_at,
        updated_at
      from public.case_operational_facts
      where case_id = ${input.caseId}
      order by category asc, label asc, updated_at desc, id asc
    `,
    sql`
      select
        id,
        case_id,
        event_key,
        event_kind,
        title,
        description,
        occurred_at,
        occurred_at_precision,
        confidence,
        source_span_ids,
        created_at,
        updated_at
      from public.case_chronology_events
      where case_id = ${input.caseId}
      order by occurred_at asc nulls last, created_at asc, id asc
    `,
    sql`
      select
        id,
        case_id,
        issue_key,
        issue_type,
        severity,
        status,
        title,
        description,
        provenance_summary,
        related_fact_ids,
        related_event_ids,
        source_span_ids,
        detected_at,
        created_at,
        updated_at
      from public.case_operational_issues
      where case_id = ${input.caseId}
      order by
        case severity
          when 'high' then 0
          when 'medium' then 1
          else 2
        end,
        issue_type asc,
        detected_at desc,
        id asc
    `,
  ]);

  return {
    sourceDocuments: (sourceDocumentRows as CaseWorkspaceSourceDocumentRow[]).map(
      toCaseWorkspaceSourceDocumentDto
    ),
    sourceSpans: (sourceSpanRows as CaseWorkspaceSourceSpanRow[]).map(
      toCaseWorkspaceSourceSpanDto
    ),
    facts: (factRows as CaseWorkspaceFactRow[]).map(toCaseWorkspaceFactDto),
    chronologyEvents: (
      chronologyEventRows as CaseWorkspaceChronologyEventRow[]
    ).map(toCaseWorkspaceChronologyEventDto),
    issues: (issueRows as CaseWorkspaceIssueRow[]).map(
      toCaseWorkspaceIssueDto
    ),
  };
}

export async function upsertCaseWorkspaceSourceDocuments(
  documents: UpsertSourceDocumentInput[],
): Promise<CaseWorkspaceSourceDocumentDto[]> {
  const sql = createNeonSql();
  const results = await Promise.all(
    documents.map(async (document) => {
      const rows = await sql`
        insert into public.case_source_documents (
          case_id,
          source_key,
          title,
          file_name,
          source_kind,
          case_document_id,
          ocr_conversion_id,
          document_sha256,
          ocr_status,
          source_date,
          received_at
        )
        values (
          ${document.caseId},
          ${document.sourceKey},
          ${document.title},
          ${document.fileName},
          ${document.sourceKind},
          ${document.caseDocumentId},
          ${document.ocrConversionId},
          ${document.documentSha256},
          ${document.ocrStatus},
          ${document.sourceDate},
          ${document.receivedAt}
        )
        on conflict (case_id, source_key) do update
        set
          title = excluded.title,
          file_name = excluded.file_name,
          source_kind = excluded.source_kind,
          case_document_id = excluded.case_document_id,
          ocr_conversion_id = excluded.ocr_conversion_id,
          document_sha256 = excluded.document_sha256,
          ocr_status = excluded.ocr_status,
          source_date = excluded.source_date,
          received_at = excluded.received_at,
          updated_at = now()
        returning
          id,
          case_id,
          source_key,
          title,
          file_name,
          source_kind,
          case_document_id,
          ocr_conversion_id,
          document_sha256,
          null as mime_type,
          null as size_bytes,
          ocr_status,
          source_date,
          received_at,
          created_at,
          updated_at
      `;
      const [row] = rows as CaseWorkspaceSourceDocumentRow[];

      return toCaseWorkspaceSourceDocumentDto(row);
    }),
  );

  return results;
}

export async function upsertCaseWorkspaceSourceSpans(
  spans: UpsertSourceSpanInput[],
): Promise<CaseWorkspaceSourceSpanDto[]> {
  const sql = createNeonSql();
  const results = await Promise.all(
    spans.map(async (span) => {
      const rows = await sql`
        insert into public.case_source_spans (
          case_id,
          source_document_id,
          span_key,
          page_index,
          page_label,
          field_path,
          verbatim_excerpt,
          confidence
        )
        values (
          ${span.caseId},
          ${span.sourceDocumentId},
          ${span.spanKey},
          ${span.pageIndex},
          ${span.pageLabel},
          ${span.fieldPath},
          ${span.verbatimExcerpt},
          ${span.confidence}
        )
        on conflict (case_id, span_key) do update
        set
          source_document_id = excluded.source_document_id,
          page_index = excluded.page_index,
          page_label = excluded.page_label,
          field_path = excluded.field_path,
          verbatim_excerpt = excluded.verbatim_excerpt,
          confidence = excluded.confidence,
          captured_at = now(),
          updated_at = now()
        returning
          id,
          case_id,
          source_document_id,
          span_key,
          page_index,
          page_label,
          field_path,
          verbatim_excerpt,
          confidence,
          captured_at,
          created_at,
          updated_at
      `;
      const [row] = rows as CaseWorkspaceSourceSpanRow[];

      return toCaseWorkspaceSourceSpanDto(row);
    }),
  );

  return results;
}

export async function upsertCaseWorkspaceFacts(
  facts: UpsertFactInput[],
): Promise<CaseWorkspaceFactDto[]> {
  const sql = createNeonSql();
  const results = await Promise.all(
    facts.map(async (fact) => {
      const rows = await sql`
        insert into public.case_operational_facts (
          case_id,
          fact_key,
          label,
          category,
          category_detail,
          value_type,
          stated_value,
          normalized_value,
          calculated_value,
          effective_at,
          observed_at,
          is_current,
          confidence,
          source_span_ids
        )
        values (
          ${fact.caseId},
          ${fact.factKey},
          ${fact.label},
          ${fact.category},
          ${fact.categoryDetail},
          ${fact.valueType},
          ${fact.statedValue},
          ${fact.normalizedValue},
          ${fact.calculatedValue},
          ${fact.effectiveAt},
          ${fact.observedAt},
          ${fact.isCurrent},
          ${fact.confidence},
          ${fact.sourceSpanIds}
        )
        on conflict (case_id, fact_key) do update
        set
          label = excluded.label,
          category = excluded.category,
          category_detail = excluded.category_detail,
          value_type = excluded.value_type,
          stated_value = excluded.stated_value,
          normalized_value = excluded.normalized_value,
          calculated_value = excluded.calculated_value,
          effective_at = excluded.effective_at,
          observed_at = excluded.observed_at,
          is_current = excluded.is_current,
          confidence = excluded.confidence,
          source_span_ids = excluded.source_span_ids,
          updated_at = now()
        returning
          id,
          case_id,
          fact_key,
          label,
          category,
          category_detail,
          value_type,
          stated_value,
          normalized_value,
          calculated_value,
          effective_at,
          observed_at,
          is_current,
          confidence,
          source_span_ids,
          created_at,
          updated_at
      `;
      const [row] = rows as CaseWorkspaceFactRow[];

      return toCaseWorkspaceFactDto(row);
    }),
  );

  return results;
}

export async function upsertCaseWorkspaceChronologyEvents(
  events: UpsertChronologyEventInput[],
): Promise<CaseWorkspaceChronologyEventDto[]> {
  const sql = createNeonSql();
  const results = await Promise.all(
    events.map(async (event) => {
      const rows = await sql`
        insert into public.case_chronology_events (
          case_id,
          event_key,
          event_kind,
          title,
          description,
          occurred_at,
          occurred_at_precision,
          confidence,
          source_span_ids
        )
        values (
          ${event.caseId},
          ${event.eventKey},
          ${event.eventKind},
          ${event.title},
          ${event.description},
          ${event.occurredAt},
          ${event.occurredAtPrecision},
          ${event.confidence},
          ${event.sourceSpanIds}
        )
        on conflict (case_id, event_key) do update
        set
          event_kind = excluded.event_kind,
          title = excluded.title,
          description = excluded.description,
          occurred_at = excluded.occurred_at,
          occurred_at_precision = excluded.occurred_at_precision,
          confidence = excluded.confidence,
          source_span_ids = excluded.source_span_ids,
          updated_at = now()
        returning
          id,
          case_id,
          event_key,
          event_kind,
          title,
          description,
          occurred_at,
          occurred_at_precision,
          confidence,
          source_span_ids,
          created_at,
          updated_at
      `;
      const [row] = rows as CaseWorkspaceChronologyEventRow[];

      return toCaseWorkspaceChronologyEventDto(row);
    }),
  );

  return results;
}

export async function upsertCaseWorkspaceIssues(
  issues: UpsertIssueInput[],
): Promise<CaseWorkspaceIssueDto[]> {
  const sql = createNeonSql();
  const results = await Promise.all(
    issues.map(async (issue) => {
      const rows = await sql`
        insert into public.case_operational_issues (
          case_id,
          issue_key,
          issue_type,
          severity,
          status,
          title,
          description,
          provenance_summary,
          related_fact_ids,
          related_event_ids,
          source_span_ids
        )
        values (
          ${issue.caseId},
          ${issue.issueKey},
          ${issue.issueType},
          ${issue.severity},
          ${issue.status},
          ${issue.title},
          ${issue.description},
          ${issue.provenanceSummary},
          ${issue.relatedFactIds},
          ${issue.relatedEventIds},
          ${issue.sourceSpanIds}
        )
        on conflict (case_id, issue_key) do update
        set
          issue_type = excluded.issue_type,
          severity = excluded.severity,
          status = excluded.status,
          title = excluded.title,
          description = excluded.description,
          provenance_summary = excluded.provenance_summary,
          related_fact_ids = excluded.related_fact_ids,
          related_event_ids = excluded.related_event_ids,
          source_span_ids = excluded.source_span_ids,
          detected_at = now(),
          updated_at = now()
        returning
          id,
          case_id,
          issue_key,
          issue_type,
          severity,
          status,
          title,
          description,
          provenance_summary,
          related_fact_ids,
          related_event_ids,
          source_span_ids,
          detected_at,
          created_at,
          updated_at
      `;
      const [row] = rows as CaseWorkspaceIssueRow[];

      return toCaseWorkspaceIssueDto(row);
    }),
  );

  return results;
}
