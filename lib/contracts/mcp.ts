import { z } from "zod";

import {
  casePrioritySchema,
  caseTypeSchema,
  isoDateTimeSchema,
} from "@/lib/contracts/cases";
import {
  caseWorkspaceEventKindSchema,
  caseWorkspaceFactValueTypeSchema,
  caseWorkspaceIssueSeveritySchema,
  caseWorkspaceIssueStatusSchema,
  caseWorkspaceIssueTypeSchema,
  caseWorkspaceSourceKindSchema,
} from "@/lib/contracts/case-workspace";
import {
  revisionChangeTypeSchema,
  revisionClaimConfidenceSchema,
  revisionClaimStatusSchema,
} from "@/lib/contracts/document-revisions";
import {
  operationalSignalGeneratedBySchema,
  operationalSignalImportanceSchema,
  operationalSignalStateSchema,
  operationalSignalTypeSchema,
} from "@/lib/contracts/operational-signals";
import {
  matterOperationSourceTypeSchema,
  matterOperationStateSchema,
} from "@/lib/contracts/matter-operations";
import {
  reviewActionKindSchema,
  reviewActionPrioritySchema,
  reviewActionRequiredCapabilitySchema,
} from "@/lib/contracts/review-reducer";

export const MURDOCK_MCP_VERSION = "murdock-mcp.v1";

export const mcpOpaqueRefSchema = z
  .string()
  .regex(/^(doc|span|fact|event|issue|action|claim|signal|operation)_[a-f0-9]{16}$/);

export const murdockMcpToolNameSchema = z.enum([
  "list_cases",
  "get_case_context",
  "list_case_documents",
  "get_case_review_digest",
  "get_case_review_group",
  "get_open_review_actions",
  "get_document_updates",
  "get_matter_snapshot",
  "get_operational_signals",
  "get_source_span",
  "search_case_evidence",
  "record_review_action_event",
]);

export type MurdockMcpToolName = z.infer<typeof murdockMcpToolNameSchema>;

export const murdockMcpCaseRefSchema = z
  .object({
    caseRef: z.string().min(1).optional(),
    caseId: z.uuid().optional(),
    caseSlug: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.caseId || value.caseRef || value.caseSlug), {
    message: "Provide caseRef, caseId, or caseSlug.",
  });

export type MurdockMcpCaseRef = z.infer<typeof murdockMcpCaseRefSchema>;

export const murdockMcpToolDescriptorSchema = z.object({
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()),
  name: murdockMcpToolNameSchema,
  title: z.string().min(1),
});

export type MurdockMcpToolDescriptor = z.infer<
  typeof murdockMcpToolDescriptorSchema
>;

export const listCasesInputSchema = z.object({
  limit: z.number().int().positive().max(50).default(25),
});

export const mcpCaseSummarySchema = z.object({
  caseRef: z.string().min(1),
  clientName: z.string().min(1).nullable(),
  nextAction: z.string().min(1).nullable(),
  nextDeadlineAt: isoDateTimeSchema.nullable(),
  priority: casePrioritySchema,
  title: z.string().min(1),
  type: caseTypeSchema,
  updatedAt: isoDateTimeSchema,
});

export const listCasesOutputSchema = z.object({
  cases: z.array(mcpCaseSummarySchema),
  generatedAt: isoDateTimeSchema,
});

export const caseContextSectionSchema = z.enum([
  "documents",
  "facts",
  "chronology",
  "issues",
  "review_actions",
  "source_spans",
]);

export const getCaseContextInputSchema = murdockMcpCaseRefSchema.extend({
  sections: z.array(caseContextSectionSchema).default([
    "documents",
    "facts",
    "chronology",
    "issues",
    "review_actions",
  ]),
});

export const mcpReviewActionSchema = z.object({
  actionLabel: z.string().min(1),
  actionRef: mcpOpaqueRefSchema,
  blocking: z.boolean(),
  kind: reviewActionKindSchema,
  priority: reviewActionPrioritySchema,
  requiredCapability: reviewActionRequiredCapabilitySchema,
  resolvedAt: isoDateTimeSchema.nullable(),
  sourceSpanCount: z.number().int().nonnegative(),
  sourceSpanRefs: z.array(mcpOpaqueRefSchema),
  status: z.enum(["open", "resolved", "dismissed"]),
  summary: z.string().min(1),
  title: z.string().min(1),
});

export const getCaseContextOutputSchema = z.object({
  case: mcpCaseSummarySchema,
  chronologyEvents: z
    .array(
      z.object({
        confidence: z.number().min(0).max(1).nullable(),
        description: z.string().min(1).nullable(),
        eventKind: caseWorkspaceEventKindSchema,
        eventRef: mcpOpaqueRefSchema,
        occurredAt: isoDateTimeSchema.nullable(),
        occurredAtPrecision: z.enum(["exact", "day", "month", "unknown"]),
        sourceSpanCount: z.number().int().nonnegative(),
        sourceSpanRefs: z.array(mcpOpaqueRefSchema),
        title: z.string().min(1),
      }),
    )
    .optional(),
  counts: z.object({
    chronologyEventCount: z.number().int().nonnegative(),
    documentCount: z.number().int().nonnegative(),
    factCount: z.number().int().nonnegative(),
    issueCount: z.number().int().nonnegative(),
    openReviewActionCount: z.number().int().nonnegative(),
    sourceSpanCount: z.number().int().nonnegative(),
  }),
  facts: z
    .array(
      z.object({
        calculatedValue: z.string().min(1).nullable(),
        category: z.string().min(1),
        categoryDetail: z.string().min(1).nullable(),
        confidence: z.number().min(0).max(1).nullable(),
        effectiveAt: isoDateTimeSchema.nullable(),
        factRef: mcpOpaqueRefSchema,
        isCurrent: z.boolean(),
        label: z.string().min(1),
        normalizedValue: z.string().min(1).nullable(),
        observedAt: isoDateTimeSchema.nullable(),
        sourceSpanCount: z.number().int().nonnegative(),
        sourceSpanRefs: z.array(mcpOpaqueRefSchema),
        statedValue: z.string().min(1).nullable(),
        valueType: caseWorkspaceFactValueTypeSchema,
      }),
    )
    .optional(),
  generatedAt: isoDateTimeSchema,
  issues: z
    .array(
      z.object({
        description: z.string().min(1).nullable(),
        issueRef: mcpOpaqueRefSchema,
        issueType: caseWorkspaceIssueTypeSchema,
        provenanceSummary: z.string().min(1).nullable(),
        relatedEventRefs: z.array(mcpOpaqueRefSchema),
        relatedFactRefs: z.array(mcpOpaqueRefSchema),
        severity: caseWorkspaceIssueSeveritySchema,
        sourceSpanCount: z.number().int().nonnegative(),
        sourceSpanRefs: z.array(mcpOpaqueRefSchema),
        status: caseWorkspaceIssueStatusSchema,
        title: z.string().min(1),
      }),
    )
    .optional(),
  reviewActions: z.array(mcpReviewActionSchema).optional(),
  sourceDocuments: z
    .array(
      z.object({
        documentRef: mcpOpaqueRefSchema,
        fileName: z.string().min(1),
        mimeType: z.string().min(1).nullable(),
        ocrStatus: z.string().min(1).nullable(),
        receivedAt: isoDateTimeSchema.nullable(),
        sizeBytes: z.number().int().positive().nullable(),
        sourceDate: isoDateTimeSchema.nullable(),
        sourceKind: caseWorkspaceSourceKindSchema,
        title: z.string().min(1),
      }),
    )
    .optional(),
  sourceSpans: z
    .array(
      z.object({
        confidence: z.number().min(0).max(1).nullable(),
        fieldPath: z.string().min(1).nullable(),
        pageIndex: z.number().int().nonnegative().nullable(),
        pageLabel: z.string().min(1).nullable(),
        sourceDocumentRef: mcpOpaqueRefSchema,
        sourceSpanRef: mcpOpaqueRefSchema,
        verbatimExcerpt: z.string().min(1),
      }),
    )
    .optional(),
});

export const listCaseDocumentsInputSchema = murdockMcpCaseRefSchema;

export const listCaseDocumentsOutputSchema = z.object({
  case: mcpCaseSummarySchema,
  generatedAt: isoDateTimeSchema,
  sourceDocuments: getCaseContextOutputSchema.shape.sourceDocuments.unwrap(),
});

export const getOpenReviewActionsInputSchema = murdockMcpCaseRefSchema.extend({
  includeSourceSpans: z.boolean().default(true),
});

export const mcpSourceSpanSchema =
  getCaseContextOutputSchema.shape.sourceSpans.unwrap().element;

export const getOpenReviewActionsOutputSchema = z.object({
  case: mcpCaseSummarySchema,
  generatedAt: isoDateTimeSchema,
  reviewActions: z.array(mcpReviewActionSchema),
  sourceSpans: z.array(mcpSourceSpanSchema).optional(),
});

export const getCaseReviewDigestInputSchema = murdockMcpCaseRefSchema.extend({
  includeLowPriority: z.boolean().default(false),
});

export const mcpReviewDigestGroupKeySchema = z.enum([
  "legal_judgment",
  "factual_completion",
  "document_updates",
  "operational_followup",
]);

export const getCaseReviewGroupInputSchema = murdockMcpCaseRefSchema.extend({
  groupKey: mcpReviewDigestGroupKeySchema,
  includeLowPriority: z.boolean().default(false),
  maxItems: z.number().int().positive().max(25).default(10),
});

export const mcpReviewDigestAudienceSchema = z.enum([
  "legal_judgment",
  "factual_completion",
  "document_version_review",
  "operational_followup",
  "mixed",
]);

export const mcpReviewDigestItemSchema = z.object({
  actionRef: mcpOpaqueRefSchema,
  blocking: z.boolean(),
  kind: reviewActionKindSchema,
  priority: reviewActionPrioritySchema,
  requiredCapability: reviewActionRequiredCapabilitySchema,
  sourceSpanCount: z.number().int().nonnegative(),
  summary: z.string().min(1),
  title: z.string().min(1),
});

export const mcpReviewDigestGroupSchema = z.object({
  audience: mcpReviewDigestAudienceSchema,
  description: z.string().min(1),
  itemCount: z.number().int().nonnegative(),
  items: z.array(mcpReviewDigestItemSchema),
  key: mcpReviewDigestGroupKeySchema,
  label: z.string().min(1),
  omittedCount: z.number().int().nonnegative(),
  priority: reviewActionPrioritySchema,
  sampleTitles: z.array(z.string().min(1)),
});

export const getCaseReviewDigestOutputSchema = z.object({
  case: mcpCaseSummarySchema,
  counts: z.object({
    blockingOpenActionCount: z.number().int().nonnegative(),
    conflictOpenActionCount: z.number().int().nonnegative(),
    lowPriorityOpenActionCount: z.number().int().nonnegative(),
    omittedLowPriorityCount: z.number().int().nonnegative(),
    openActionCount: z.number().int().nonnegative(),
    revisionOpenActionCount: z.number().int().nonnegative(),
  }),
  generatedAt: isoDateTimeSchema,
  groups: z.array(mcpReviewDigestGroupSchema),
});

export const getCaseReviewGroupOutputSchema = z.object({
  case: mcpCaseSummarySchema,
  generatedAt: isoDateTimeSchema,
  group: mcpReviewDigestGroupSchema,
});

export const getDocumentUpdatesInputSchema = murdockMcpCaseRefSchema.extend({
  sourceDocumentRef: mcpOpaqueRefSchema.optional(),
});

export const getDocumentUpdatesOutputSchema = z.object({
  case: mcpCaseSummarySchema,
  generatedAt: isoDateTimeSchema,
  revisions: z.array(
    z.object({
      claims: z.array(
        z.object({
          afterSourceSpanRefs: z.array(mcpOpaqueRefSchema),
          afterValue: z.unknown().nullable(),
          beforeSourceSpanRefs: z.array(mcpOpaqueRefSchema),
          beforeValue: z.unknown().nullable(),
          changeType: revisionChangeTypeSchema,
          claimRef: mcpOpaqueRefSchema,
          confidence: revisionClaimConfidenceSchema,
          fieldLabel: z.string().min(1),
          fieldPath: z.string().min(1),
          status: revisionClaimStatusSchema,
        }),
      ),
      documentLabel: z.string().min(1),
      fromVersionLabel: z.string().min(1),
      toVersionLabel: z.string().min(1),
    }),
  ),
});

export const getOperationalSignalsInputSchema = murdockMcpCaseRefSchema.extend({
  includeInformational: z.boolean().default(true),
  limit: z.number().int().positive().max(100).default(50),
});

export const getOperationalSignalsOutputSchema = z.object({
  case: mcpCaseSummarySchema,
  generatedAt: isoDateTimeSchema,
  signals: z.array(
    z.object({
      actorType: z.enum(["system", "user", "external"]),
      generatedBy: operationalSignalGeneratedBySchema,
      importance: operationalSignalImportanceSchema,
      observedAt: isoDateTimeSchema,
      occurredAt: isoDateTimeSchema.nullable(),
      signalRef: mcpOpaqueRefSchema,
      signalType: operationalSignalTypeSchema,
      sourceRefCount: z.number().int().nonnegative(),
      sourceSpanCount: z.number().int().nonnegative(),
      state: operationalSignalStateSchema,
      summary: z.string().min(1),
      title: z.string().min(1),
    }),
  ),
});

export const getMatterSnapshotInputSchema = murdockMcpCaseRefSchema.extend({
  includeHistory: z.boolean().default(false),
});

export const mcpMatterOperationSchema = z.object({
  blocking: z.boolean(),
  current: z.boolean(),
  operationRef: mcpOpaqueRefSchema,
  priority: reviewActionPrioritySchema,
  provenanceRefCount: z.number().int().nonnegative(),
  requiredCapability: reviewActionRequiredCapabilitySchema,
  sourceType: matterOperationSourceTypeSchema,
  state: matterOperationStateSchema,
  summary: z.string().min(1),
  title: z.string().min(1),
  updatedAt: isoDateTimeSchema,
});

export const getMatterSnapshotOutputSchema = z.object({
  activeOperations: z.array(mcpMatterOperationSchema),
  case: mcpCaseSummarySchema,
  counts: z.object({
    activeOperationCount: z.number().int().nonnegative(),
    blockingActiveOperationCount: z.number().int().nonnegative(),
    currentOperationCount: z.number().int().nonnegative(),
    dismissedOperationCount: z.number().int().nonnegative(),
    ignoredOperationCount: z.number().int().nonnegative(),
    inReviewOperationCount: z.number().int().nonnegative(),
    openOperationCount: z.number().int().nonnegative(),
    resolvedOperationCount: z.number().int().nonnegative(),
    supersededOperationCount: z.number().int().nonnegative(),
    totalOperationCount: z.number().int().nonnegative(),
    untrackedOperationCount: z.number().int().nonnegative(),
  }),
  currentOperations: z.array(mcpMatterOperationSchema),
  generatedAt: isoDateTimeSchema,
  historyIncluded: z.boolean(),
});

export const getSourceSpanInputSchema = murdockMcpCaseRefSchema.extend({
  sourceSpanRef: mcpOpaqueRefSchema,
});

export const getSourceSpanOutputSchema = z.object({
  case: mcpCaseSummarySchema,
  generatedAt: isoDateTimeSchema,
  sourceDocument: listCaseDocumentsOutputSchema.shape.sourceDocuments.element.nullable(),
  sourceSpan: mcpSourceSpanSchema,
});

export const searchCaseEvidenceInputSchema = murdockMcpCaseRefSchema.extend({
  limit: z.number().int().positive().max(25).default(10),
  query: z.string().trim().min(1).max(160),
});

export const mcpEvidenceMatchSchema = z.object({
  documentRef: mcpOpaqueRefSchema.nullable(),
  fieldPath: z.string().min(1).nullable(),
  kind: z.enum([
    "source_document",
    "source_span",
    "fact",
    "chronology_event",
    "issue",
    "review_action",
    "document_update",
    "operational_signal",
  ]),
  label: z.string().min(1),
  score: z.number().int().nonnegative(),
  sourceSpanRefs: z.array(mcpOpaqueRefSchema),
  text: z.string().min(1),
});

export const searchCaseEvidenceOutputSchema = z.object({
  case: mcpCaseSummarySchema,
  generatedAt: isoDateTimeSchema,
  matches: z.array(mcpEvidenceMatchSchema),
  query: z.string().min(1),
});

export const recordReviewActionEventInputSchema = murdockMcpCaseRefSchema.extend({
  actionRef: mcpOpaqueRefSchema,
  eventType: z.enum(["comment", "resolved", "dismissed", "reopened"]),
  note: z.string().trim().min(1).max(2000).nullable().default(null),
});

export const recordReviewActionEventOutputSchema = z.object({
  action: mcpReviewActionSchema,
  eventType: z.enum(["comment", "resolved", "dismissed", "reopened"]),
  generatedAt: isoDateTimeSchema,
});

export const murdockMcpInputSchemas = {
  get_case_review_digest: getCaseReviewDigestInputSchema,
  get_case_review_group: getCaseReviewGroupInputSchema,
  get_case_context: getCaseContextInputSchema,
  get_document_updates: getDocumentUpdatesInputSchema,
  get_matter_snapshot: getMatterSnapshotInputSchema,
  get_open_review_actions: getOpenReviewActionsInputSchema,
  get_operational_signals: getOperationalSignalsInputSchema,
  get_source_span: getSourceSpanInputSchema,
  list_case_documents: listCaseDocumentsInputSchema,
  list_cases: listCasesInputSchema,
  record_review_action_event: recordReviewActionEventInputSchema,
  search_case_evidence: searchCaseEvidenceInputSchema,
} satisfies Record<MurdockMcpToolName, z.ZodType>;

export const murdockMcpOutputSchemas = {
  get_case_review_digest: getCaseReviewDigestOutputSchema,
  get_case_review_group: getCaseReviewGroupOutputSchema,
  get_case_context: getCaseContextOutputSchema,
  get_document_updates: getDocumentUpdatesOutputSchema,
  get_matter_snapshot: getMatterSnapshotOutputSchema,
  get_open_review_actions: getOpenReviewActionsOutputSchema,
  get_operational_signals: getOperationalSignalsOutputSchema,
  get_source_span: getSourceSpanOutputSchema,
  list_case_documents: listCaseDocumentsOutputSchema,
  list_cases: listCasesOutputSchema,
  record_review_action_event: recordReviewActionEventOutputSchema,
  search_case_evidence: searchCaseEvidenceOutputSchema,
} satisfies Record<MurdockMcpToolName, z.ZodType>;

export const murdockMcpToolSuccessSchema = z.object({
  data: z.unknown(),
  ok: z.literal(true),
  toolName: murdockMcpToolNameSchema,
  version: z.literal(MURDOCK_MCP_VERSION),
});

export const murdockMcpToolErrorSchema = z.object({
  errorCategory: z.enum([
    "not_found",
    "permission",
    "schema_validation",
    "database",
    "unsupported_tool",
    "unknown",
  ]),
  isRetryable: z.boolean(),
  message: z.string().min(1),
  ok: z.literal(false),
  toolName: murdockMcpToolNameSchema.nullable(),
  version: z.literal(MURDOCK_MCP_VERSION),
});

export const murdockMcpToolResultSchema = z.discriminatedUnion("ok", [
  murdockMcpToolSuccessSchema,
  murdockMcpToolErrorSchema,
]);

export type MurdockMcpToolResult = z.infer<typeof murdockMcpToolResultSchema>;
