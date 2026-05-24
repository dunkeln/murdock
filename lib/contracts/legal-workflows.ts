import { z } from "zod";

import {
  casePrioritySchema,
  caseTypeSchema,
  isoDateTimeSchema,
} from "@/lib/contracts/cases";
import { caseDocumentStatusSchema } from "@/lib/contracts/case-documents";
import {
  documentSha256Schema,
  ocrConversionStatusSchema,
} from "@/lib/contracts/ocr-conversions";

export const workflowKeySchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Expected a lowercase slug key such as immigration-asylum-intake.",
  );

export const workflowStageKeySchema = z
  .string()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Expected a lowercase slug key such as document-review.",
  );

export const legalWorkflowStatusSchema = z.enum([
  "not_started",
  "active",
  "blocked",
  "ready_for_review",
  "completed",
  "archived",
]);

export type LegalWorkflowStatus = z.infer<typeof legalWorkflowStatusSchema>;

export const legalWorkflowStageStatusSchema = z.enum([
  "not_started",
  "active",
  "blocked",
  "completed",
  "skipped",
]);

export type LegalWorkflowStageStatus = z.infer<
  typeof legalWorkflowStageStatusSchema
>;

export const legalWorkflowDocumentPurposeSchema = z.enum([
  "intake",
  "identity",
  "financial",
  "court",
  "agency",
  "evidence",
  "correspondence",
  "work_product",
  "source",
  "general",
]);

export type LegalWorkflowDocumentPurpose = z.infer<
  typeof legalWorkflowDocumentPurposeSchema
>;

export const legalWorkflowFactValueTypeSchema = z.enum([
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

export type LegalWorkflowFactValueType = z.infer<
  typeof legalWorkflowFactValueTypeSchema
>;

export const legalWorkflowTaskStatusSchema = z.enum([
  "open",
  "blocked",
  "ready_for_review",
  "completed",
  "cancelled",
]);

export type LegalWorkflowTaskStatus = z.infer<
  typeof legalWorkflowTaskStatusSchema
>;

export const legalWorkflowReviewOutcomeSchema = z.enum([
  "approved",
  "rejected",
  "needs_review",
  "blocked",
  "waived",
]);

export type LegalWorkflowReviewOutcome = z.infer<
  typeof legalWorkflowReviewOutcomeSchema
>;

export const legalWorkflowReviewKindSchema = z.enum([
  "human_review",
  "automation_gate",
  "filing_readiness",
  "inconsistency",
  "missing_information",
  "general",
]);

export type LegalWorkflowReviewKind = z.infer<
  typeof legalWorkflowReviewKindSchema
>;

export const legalWorkflowSourceCitationDtoSchema = z.object({
  documentRefId: z.uuid().nullable(),
  caseDocumentId: z.uuid().nullable(),
  ocrConversionId: z.uuid().nullable(),
  pageIndex: z.number().int().nonnegative().nullable(),
  pageLabel: z.string().min(1).nullable(),
  fieldPath: z.string().min(1).nullable(),
  excerpt: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export type LegalWorkflowSourceCitationDto = z.infer<
  typeof legalWorkflowSourceCitationDtoSchema
>;

export const legalWorkflowStageDefinitionDtoSchema = z.object({
  key: workflowStageKeySchema,
  title: z.string().min(1),
  description: z.string().min(1).nullable(),
  order: z.number().int().nonnegative(),
});

export type LegalWorkflowStageDefinitionDto = z.infer<
  typeof legalWorkflowStageDefinitionDtoSchema
>;

export const legalWorkflowRequiredDocumentDtoSchema = z.object({
  purpose: legalWorkflowDocumentPurposeSchema,
  purposeDetail: z.string().min(1).nullable(),
  title: z.string().min(1),
  isRequired: z.boolean(),
});

export type LegalWorkflowRequiredDocumentDto = z.infer<
  typeof legalWorkflowRequiredDocumentDtoSchema
>;

export const legalWorkflowDefinitionDtoSchema = z.object({
  key: workflowKeySchema,
  version: z.string().min(1),
  title: z.string().min(1),
  caseType: caseTypeSchema,
  practiceArea: z.string().min(1).nullable(),
  description: z.string().min(1).nullable(),
  stages: z.array(legalWorkflowStageDefinitionDtoSchema).min(1),
  requiredDocuments: z.array(legalWorkflowRequiredDocumentDtoSchema),
});

export type LegalWorkflowDefinitionDto = z.infer<
  typeof legalWorkflowDefinitionDtoSchema
>;

export const legalWorkflowDocumentRefDtoSchema = z.object({
  id: z.uuid(),
  caseDocumentId: z.uuid().nullable(),
  ocrConversionId: z.uuid().nullable(),
  documentSha256: documentSha256Schema.nullable(),
  fileName: z.string().min(1),
  title: z.string().min(1),
  purpose: legalWorkflowDocumentPurposeSchema,
  purposeDetail: z.string().min(1).nullable(),
  status: caseDocumentStatusSchema,
  ocrStatus: ocrConversionStatusSchema.nullable(),
  uploadedAt: isoDateTimeSchema.nullable(),
});

export type LegalWorkflowDocumentRefDto = z.infer<
  typeof legalWorkflowDocumentRefDtoSchema
>;

export const legalWorkflowFactDtoSchema = z.object({
  id: z.uuid(),
  key: z.string().min(1),
  label: z.string().min(1),
  category: z.string().min(1),
  categoryDetail: z.string().min(1).nullable(),
  valueType: legalWorkflowFactValueTypeSchema,
  statedValue: z.unknown().nullable(),
  normalizedValue: z.unknown().nullable(),
  calculatedValue: z.unknown().nullable(),
  isMissing: z.boolean(),
  confidence: z.number().min(0).max(1).nullable(),
  sources: z.array(legalWorkflowSourceCitationDtoSchema),
  extractedAt: isoDateTimeSchema.nullable(),
});

export type LegalWorkflowFactDto = z.infer<typeof legalWorkflowFactDtoSchema>;

export const legalWorkflowTaskDtoSchema = z.object({
  id: z.uuid(),
  stageKey: workflowStageKeySchema.nullable(),
  title: z.string().min(1),
  description: z.string().min(1).nullable(),
  status: legalWorkflowTaskStatusSchema,
  priority: casePrioritySchema,
  assigneeRole: z.string().min(1).nullable(),
  dueAt: isoDateTimeSchema.nullable(),
  relatedFactIds: z.array(z.uuid()),
  relatedDocumentRefIds: z.array(z.uuid()),
});

export type LegalWorkflowTaskDto = z.infer<typeof legalWorkflowTaskDtoSchema>;

export const legalWorkflowReviewDecisionDtoSchema = z.object({
  id: z.uuid(),
  stageKey: workflowStageKeySchema.nullable(),
  kind: legalWorkflowReviewKindSchema,
  kindDetail: z.string().min(1).nullable(),
  prompt: z.string().min(1),
  outcome: legalWorkflowReviewOutcomeSchema,
  rationale: z.string().min(1).nullable(),
  reviewerDisplayName: z.string().min(1).nullable(),
  decidedAt: isoDateTimeSchema.nullable(),
  relatedFactIds: z.array(z.uuid()),
  relatedDocumentRefIds: z.array(z.uuid()),
});

export type LegalWorkflowReviewDecisionDto = z.infer<
  typeof legalWorkflowReviewDecisionDtoSchema
>;

export const legalWorkflowStageSnapshotDtoSchema = z.object({
  key: workflowStageKeySchema,
  title: z.string().min(1),
  status: legalWorkflowStageStatusSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
});

export type LegalWorkflowStageSnapshotDto = z.infer<
  typeof legalWorkflowStageSnapshotDtoSchema
>;

export const legalWorkflowRunDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  workflowKey: workflowKeySchema,
  workflowVersion: z.string().min(1),
  title: z.string().min(1),
  status: legalWorkflowStatusSchema,
  currentStageKey: workflowStageKeySchema.nullable(),
  stages: z.array(legalWorkflowStageSnapshotDtoSchema),
  documents: z.array(legalWorkflowDocumentRefDtoSchema),
  facts: z.array(legalWorkflowFactDtoSchema),
  tasks: z.array(legalWorkflowTaskDtoSchema),
  reviewDecisions: z.array(legalWorkflowReviewDecisionDtoSchema),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type LegalWorkflowRunDto = z.infer<typeof legalWorkflowRunDtoSchema>;

export const createLegalWorkflowRunInputSchema = z.object({
  caseId: z.uuid(),
  definition: legalWorkflowDefinitionDtoSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateLegalWorkflowRunInput = z.input<
  typeof createLegalWorkflowRunInputSchema
>;
