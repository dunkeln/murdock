import "server-only";

import type {
  CaseWorkspaceChronologyEventDto,
  CaseWorkspaceFactDto,
  CaseWorkspaceIssueDto,
  CaseWorkspaceSourceDocumentDto,
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
    sql`
      select
        id,
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
        received_at,
        created_at,
        updated_at
      from public.case_source_documents
      where case_id = ${input.caseId}
      order by coalesce(source_date, received_at, created_at) asc, id asc
    `,
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
