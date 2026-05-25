import { describe, expect, it } from "vitest";

import {
  buildCaseControlDto,
  filterCaseControlBySourceGrounding,
} from "@/lib/case-control";
import {
  getCaseWorkspaceAttentionItems,
  getCaseWorkspaceCurrentState,
  getCaseWorkspaceMomentumItems,
  groupCaseWorkspaceIssuesByType,
  summarizeCaseWorkspace,
} from "@/lib/case-workspace";
import {
  type CaseWorkspaceDto,
  caseWorkspaceDtoSchema,
} from "@/lib/contracts/case-workspace";
import { toCaseWorkspaceServiceError } from "@/lib/server/case-workspace/errors";
import {
  toCaseWorkspaceFactDto,
  toCaseWorkspaceIssueDto,
  toCaseWorkspaceSourceDocumentDto,
  toCaseWorkspaceSourceSpanDto,
} from "@/lib/server/case-workspace/mappers";
import { toTelemetryMetadata } from "@/lib/telemetry";

const caseId = "11111111-1111-4111-8111-111111111111";
const sourceDocumentId = "22222222-2222-4222-8222-222222222222";
const sourceSpanId = "33333333-3333-4333-8333-333333333333";
const factId = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";
const issueId = "66666666-6666-4666-8666-666666666666";
const now = "2026-02-01T19:20:00.000Z";

function makeWorkspace(overrides: Partial<CaseWorkspaceDto> = {}) {
  return caseWorkspaceDtoSchema.parse({
    case: {
      id: caseId,
      slug: "acme-v-glade",
      title: "Example USCIS",
      type: "general",
      clientName: "Example client",
      priority: "high",
      nextAction: "Review surfaced deadline conflict",
      nextDeadlineAt: "2026-03-14T23:59:59.000Z",
      updatedAt: now,
    },
    sourceDocuments: [
      {
        id: sourceDocumentId,
        caseId,
        sourceKey: "notice",
        title: "USCIS notice",
        fileName: "notice.pdf",
        sourceKind: "agency",
        caseDocumentId: null,
        ocrConversionId: null,
        documentSha256: null,
        mimeType: null,
        sizeBytes: null,
        ocrStatus: "ready",
        sourceDate: "2026-01-12T17:00:00.000Z",
        receivedAt: "2026-01-12T18:10:00.000Z",
        createdAt: now,
        updatedAt: now,
      },
    ],
    sourceSpans: [
      {
        id: sourceSpanId,
        caseId,
        sourceDocumentId,
        spanKey: "deadline",
        pageIndex: 0,
        pageLabel: "1",
        fieldPath: "notice.response_due",
        verbatimExcerpt: "Response must be received by March 14, 2026.",
        confidence: 0.99,
        capturedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    facts: [
      {
        id: factId,
        caseId,
        factKey: "response-deadline",
        label: "Response deadline",
        category: "deadline",
        categoryDetail: "USCIS notice",
        valueType: "date",
        statedValue: "March 14, 2026",
        normalizedValue: "2026-03-14",
        calculatedValue: null,
        effectiveAt: "2026-03-14T23:59:59.000Z",
        observedAt: now,
        isCurrent: true,
        confidence: 0.99,
        sourceSpanIds: [sourceSpanId],
        createdAt: now,
        updatedAt: now,
      },
    ],
    chronologyEvents: [
      {
        id: eventId,
        caseId,
        eventKey: "notice-received",
        eventKind: "document_received",
        title: "USCIS notice received",
        description: "Agency notice starts the response clock.",
        occurredAt: "2026-01-12T18:10:00.000Z",
        occurredAtPrecision: "exact",
        confidence: 0.99,
        sourceSpanIds: [sourceSpanId],
        createdAt: now,
        updatedAt: now,
      },
    ],
    issues: [
      {
        id: issueId,
        caseId,
        issueKey: "deadline-conflict",
        issueType: "contradiction",
        severity: "high",
        status: "open",
        title: "Response deadline conflicts across sources",
        description: "One source says March 14 while a draft says March 10.",
        provenanceSummary: "Review source notice before relying on draft dates.",
        relatedFactIds: [factId],
        relatedEventIds: [eventId],
        sourceSpanIds: [sourceSpanId],
        detectedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    generatedAt: now,
    ...overrides,
  });
}

describe("case workspace contracts", () => {
  it("parses a provenance-first workspace with exact source excerpts", () => {
    const workspace = makeWorkspace();

    expect(workspace.sourceSpans[0]?.verbatimExcerpt).toBe(
      "Response must be received by March 14, 2026."
    );
    expect(workspace.issues[0]?.sourceSpanIds).toEqual([sourceSpanId]);
  });

  it("summarizes empty workspace states deterministically", () => {
    const workspace = makeWorkspace({
      sourceDocuments: [],
      sourceSpans: [],
      facts: [],
      chronologyEvents: [],
      issues: [],
    });

    expect(summarizeCaseWorkspace(workspace)).toEqual({
      sourceCount: 0,
      factCount: 0,
      chronologyEventCount: 0,
      issueCount: 0,
      highSeverityIssueCount: 0,
    });
  });
});

describe("case control grounding", () => {
  it("filters report cards to the current document, page, and source span", () => {
    const baseWorkspace = makeWorkspace();
    const otherSourceSpanId = "77777777-7777-4777-8777-777777777777";
    const otherIssueId = "88888888-8888-4888-8888-888888888888";
    const workspace = makeWorkspace({
      sourceDocuments: baseWorkspace.sourceDocuments.map((document) => ({
        ...document,
        ocrConversionId: "99999999-9999-4999-8999-999999999999",
      })),
      sourceSpans: [
        ...baseWorkspace.sourceSpans,
        {
          ...baseWorkspace.sourceSpans[0]!,
          id: otherSourceSpanId,
          pageIndex: 1,
          pageLabel: "2",
          spanKey: "signature",
          verbatimExcerpt: "Signature line is blank.",
        },
      ],
      issues: [
        ...baseWorkspace.issues,
        {
          ...baseWorkspace.issues[0]!,
          id: otherIssueId,
          issueKey: "signature-missing",
          title: "Signature missing",
          sourceSpanIds: [otherSourceSpanId],
        },
      ],
    });

    const control = buildCaseControlDto(workspace);
    const filtered = filterCaseControlBySourceGrounding(control, {
      docId: sourceDocumentId,
      fileName: "notice.pdf",
      pageIndex: 0,
      spanIds: new Set([sourceSpanId]),
    });

    expect(filtered.queue).toHaveLength(1);
    expect(filtered.queue[0]?.id).toBe(issueId);
    expect(filtered.queue[0]?.sourceRefs.map((source) => source.spanId)).toEqual([
      sourceSpanId,
    ]);

    const pageMismatch = filterCaseControlBySourceGrounding(control, {
      docId: sourceDocumentId,
      fileName: "notice.pdf",
      pageIndex: 1,
      spanIds: new Set([sourceSpanId]),
    });

    expect(pageMismatch.queue).toEqual([]);
  });
});

describe("case workspace row mappers", () => {
  it("maps repository rows into DTOs with numeric confidence and array links", () => {
    const sourceDocument = toCaseWorkspaceSourceDocumentDto({
      id: sourceDocumentId,
      case_id: caseId,
      source_key: "notice",
      title: "USCIS notice",
      file_name: "notice.pdf",
      source_kind: "agency",
      case_document_id: null,
      ocr_conversion_id: null,
      document_sha256: null,
      mime_type: null,
      size_bytes: null,
      ocr_status: "ready",
      source_date: "2026-01-12T17:00:00.000Z",
      received_at: "2026-01-12T18:10:00.000Z",
      created_at: now,
      updated_at: now,
    });
    const sourceSpan = toCaseWorkspaceSourceSpanDto({
      id: sourceSpanId,
      case_id: caseId,
      source_document_id: sourceDocument.id,
      span_key: "deadline",
      page_index: 0,
      page_label: "1",
      field_path: "notice.response_due",
      verbatim_excerpt: "Response must be received by March 14, 2026.",
      confidence: "0.990",
      captured_at: now,
      created_at: now,
      updated_at: now,
    });
    const fact = toCaseWorkspaceFactDto({
      id: factId,
      case_id: caseId,
      fact_key: "response-deadline",
      label: "Response deadline",
      category: "deadline",
      category_detail: "USCIS notice",
      value_type: "date",
      stated_value: "March 14, 2026",
      normalized_value: "2026-03-14",
      calculated_value: null,
      effective_at: "2026-03-14T23:59:59.000Z",
      observed_at: now,
      is_current: true,
      confidence: "0.990",
      source_span_ids: `{${sourceSpan.id}}`,
      created_at: now,
      updated_at: now,
    });

    expect(sourceSpan.confidence).toBe(0.99);
    expect(fact.sourceSpanIds).toEqual([sourceSpan.id]);
  });

  it("maps linked issue rows without raw database shapes leaking upstream", () => {
    const issue = toCaseWorkspaceIssueDto({
      id: issueId,
      case_id: caseId,
      issue_key: "deadline-conflict",
      issue_type: "contradiction",
      severity: "high",
      status: "open",
      title: "Response deadline conflicts across sources",
      description: "One source says March 14 while a draft says March 10.",
      provenance_summary: "Review source notice before relying on draft dates.",
      related_fact_ids: `{${factId}}`,
      related_event_ids: `{${eventId}}`,
      source_span_ids: `{${sourceSpanId}}`,
      detected_at: now,
      created_at: now,
      updated_at: now,
    });

    expect(issue.relatedFactIds).toEqual([factId]);
    expect(issue.issueType).toBe("contradiction");
  });
});

describe("case workspace deterministic issue handling", () => {
  it("groups surfaced issues in operational priority order", () => {
    const workspace = makeWorkspace({
      issues: [
        {
          ...makeWorkspace().issues[0]!,
          issueType: "revision_drift",
          severity: "medium",
          title: "Revision drift",
        },
        makeWorkspace().issues[0]!,
      ],
    });

    const groups = groupCaseWorkspaceIssuesByType(workspace.issues);

    expect(groups.map((group) => group.issueType)).toEqual([
      "contradiction",
      "revision_drift",
    ]);
  });

  it("derives current-state awareness from unresolved source-backed issues", () => {
    const workspace = makeWorkspace();

    expect(getCaseWorkspaceCurrentState(workspace)).toMatchObject({
      readinessTone: "blocked",
      readinessLabel: "Source items open",
      openIssueCount: 1,
      highSeverityIssueCount: 1,
      contradictionCount: 1,
      nextDeadlineAt: "2026-03-14T23:59:59.000Z",
    });
  });

  it("prioritizes attention and next-work items deterministically", () => {
    const workspace = makeWorkspace({
      issues: [
        {
          ...makeWorkspace().issues[0]!,
          id: "77777777-7777-4777-8777-777777777777",
          issueType: "missing_context",
          severity: "medium",
          title: "Signed engagement letter not present",
          detectedAt: "2026-02-01T19:23:00.000Z",
        },
        makeWorkspace().issues[0]!,
      ],
    });

    expect(getCaseWorkspaceAttentionItems(workspace).map((item) => item.title)).toEqual([
      "Response deadline conflicts across sources",
      "Signed engagement letter not present",
    ]);
    expect(getCaseWorkspaceMomentumItems(workspace).map((item) => item.label)).toEqual([
      "Contradiction",
      "Missing context",
      "Case queue",
    ]);
  });
});

describe("case workspace service errors", () => {
  it("returns a structured configuration error for missing database config", () => {
    expect(toCaseWorkspaceServiceError(new Error("NEON_CONN_URL is required"))).toEqual({
      isError: true,
      errorCategory: "configuration",
      isRetryable: false,
      message: "Workspace data requires database configuration.",
    });
  });

  it("returns a structured database error when workspace tables are absent", () => {
    expect(
      toCaseWorkspaceServiceError(
        new Error('relation "public.case_source_documents" does not exist')
      )
    ).toEqual({
      isError: true,
      errorCategory: "database",
      isRetryable: false,
      message: "Workspace tables are not available. Run database migrations.",
    });
  });
});

describe("telemetry helpers", () => {
  it("normalizes Langfuse propagated metadata to short strings", () => {
    expect(
      toTelemetryMetadata({
        caseId,
        retryable: false,
        empty: null,
        longValue: "x".repeat(220),
      })
    ).toEqual({
      caseId,
      retryable: "false",
      longValue: "x".repeat(200),
    });
  });
});
