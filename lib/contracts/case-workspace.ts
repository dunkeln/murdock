import { z } from "zod";

import { caseSummaryDtoSchema, isoDateTimeSchema } from "@/lib/contracts/cases";
import {
  documentSha256Schema,
  ocrConversionStatusSchema,
} from "@/lib/contracts/ocr-conversions";

export const caseWorkspaceSourceKindSchema = z.enum([
  "intake",
  "pleading",
  "motion",
  "order",
  "correspondence",
  "evidence",
  "agency",
  "work_product",
  "other",
]);

export type CaseWorkspaceSourceKind = z.infer<
  typeof caseWorkspaceSourceKindSchema
>;

export const caseWorkspaceFactValueTypeSchema = z.enum([
  "text",
  "number",
  "money",
  "date",
  "datetime",
  "boolean",
  "list",
  "object",
  "unknown",
]);

export type CaseWorkspaceFactValueType = z.infer<
  typeof caseWorkspaceFactValueTypeSchema
>;

export const caseWorkspaceEventKindSchema = z.enum([
  "intake",
  "document_received",
  "deadline",
  "filing",
  "court_order",
  "client_update",
  "document_revision",
  "status_change",
  "other",
]);

export type CaseWorkspaceEventKind = z.infer<
  typeof caseWorkspaceEventKindSchema
>;

export const caseWorkspaceIssueTypeSchema = z.enum([
  "revision_drift",
  "contradiction",
  "chronology_gap",
  "missing_context",
]);

export type CaseWorkspaceIssueType = z.infer<
  typeof caseWorkspaceIssueTypeSchema
>;

export const caseWorkspaceIssueSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
]);

export type CaseWorkspaceIssueSeverity = z.infer<
  typeof caseWorkspaceIssueSeveritySchema
>;

export const caseWorkspaceIssueStatusSchema = z.enum([
  "open",
  "reviewed",
  "dismissed",
]);

export type CaseWorkspaceIssueStatus = z.infer<
  typeof caseWorkspaceIssueStatusSchema
>;

export const caseWorkspaceServiceErrorSchema = z.object({
  isError: z.literal(true),
  errorCategory: z.enum([
    "not_found",
    "configuration",
    "database",
    "validation",
    "unknown",
  ]),
  isRetryable: z.boolean(),
  message: z.string().min(1),
});

export type CaseWorkspaceServiceError = z.infer<
  typeof caseWorkspaceServiceErrorSchema
>;

export const caseWorkspaceSourceDocumentDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  sourceKey: z.string().min(1),
  title: z.string().min(1),
  fileName: z.string().min(1),
  sourceKind: caseWorkspaceSourceKindSchema,
  caseDocumentId: z.uuid().nullable(),
  ocrConversionId: z.uuid().nullable(),
  documentSha256: documentSha256Schema.nullable(),
  ocrStatus: ocrConversionStatusSchema.nullable(),
  sourceDate: isoDateTimeSchema.nullable(),
  receivedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CaseWorkspaceSourceDocumentDto = z.infer<
  typeof caseWorkspaceSourceDocumentDtoSchema
>;

export const caseWorkspaceSourceSpanDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  sourceDocumentId: z.uuid(),
  spanKey: z.string().min(1),
  pageIndex: z.number().int().nonnegative().nullable(),
  pageLabel: z.string().min(1).nullable(),
  fieldPath: z.string().min(1).nullable(),
  verbatimExcerpt: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  capturedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CaseWorkspaceSourceSpanDto = z.infer<
  typeof caseWorkspaceSourceSpanDtoSchema
>;

export const caseWorkspaceFactDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  factKey: z.string().min(1),
  label: z.string().min(1),
  category: z.string().min(1),
  categoryDetail: z.string().min(1).nullable(),
  valueType: caseWorkspaceFactValueTypeSchema,
  statedValue: z.string().min(1).nullable(),
  normalizedValue: z.string().min(1).nullable(),
  calculatedValue: z.string().min(1).nullable(),
  effectiveAt: isoDateTimeSchema.nullable(),
  observedAt: isoDateTimeSchema.nullable(),
  isCurrent: z.boolean(),
  confidence: z.number().min(0).max(1).nullable(),
  sourceSpanIds: z.array(z.uuid()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CaseWorkspaceFactDto = z.infer<
  typeof caseWorkspaceFactDtoSchema
>;

export const caseWorkspaceChronologyEventDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  eventKey: z.string().min(1),
  eventKind: caseWorkspaceEventKindSchema,
  title: z.string().min(1),
  description: z.string().min(1).nullable(),
  occurredAt: isoDateTimeSchema.nullable(),
  occurredAtPrecision: z.enum(["exact", "day", "month", "unknown"]),
  confidence: z.number().min(0).max(1).nullable(),
  sourceSpanIds: z.array(z.uuid()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CaseWorkspaceChronologyEventDto = z.infer<
  typeof caseWorkspaceChronologyEventDtoSchema
>;

export const caseWorkspaceIssueDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  issueKey: z.string().min(1),
  issueType: caseWorkspaceIssueTypeSchema,
  severity: caseWorkspaceIssueSeveritySchema,
  status: caseWorkspaceIssueStatusSchema,
  title: z.string().min(1),
  description: z.string().min(1).nullable(),
  provenanceSummary: z.string().min(1).nullable(),
  relatedFactIds: z.array(z.uuid()),
  relatedEventIds: z.array(z.uuid()),
  sourceSpanIds: z.array(z.uuid()),
  detectedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type CaseWorkspaceIssueDto = z.infer<
  typeof caseWorkspaceIssueDtoSchema
>;

export const caseWorkspaceDtoSchema = z.object({
  case: caseSummaryDtoSchema,
  sourceDocuments: z.array(caseWorkspaceSourceDocumentDtoSchema),
  sourceSpans: z.array(caseWorkspaceSourceSpanDtoSchema),
  facts: z.array(caseWorkspaceFactDtoSchema),
  chronologyEvents: z.array(caseWorkspaceChronologyEventDtoSchema),
  issues: z.array(caseWorkspaceIssueDtoSchema),
  generatedAt: isoDateTimeSchema,
});

export type CaseWorkspaceDto = z.infer<typeof caseWorkspaceDtoSchema>;

export const caseWorkspaceAnalysisRequestSchema = z.object({
  caseId: z.uuid(),
  sourceDocumentIds: z.array(z.uuid()).min(1),
  requestedAt: isoDateTimeSchema,
});

export type CaseWorkspaceAnalysisRequest = z.infer<
  typeof caseWorkspaceAnalysisRequestSchema
>;

export const caseWorkspaceAnalysisResultSchema = z.object({
  facts: z.array(caseWorkspaceFactDtoSchema),
  chronologyEvents: z.array(caseWorkspaceChronologyEventDtoSchema),
  issues: z.array(caseWorkspaceIssueDtoSchema),
  sourceSpans: z.array(caseWorkspaceSourceSpanDtoSchema),
});

export type CaseWorkspaceAnalysisResult = z.infer<
  typeof caseWorkspaceAnalysisResultSchema
>;
