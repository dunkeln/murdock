import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";
import {
  documentSha256Schema,
  ocrProviderSchema,
} from "@/lib/contracts/ocr-conversions";
import { operationalCapabilitySchema } from "@/lib/contracts/operational-capability";

export const HARNESS_VERSION = "harness.v1";

export const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const sourceSpanSchema = z.object({
  id: z.string().min(1),
  docId: z.string().min(1),
  page: z.number().int().positive(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().positive(),
  quote: z.string().min(1),
  bbox: bboxSchema.nullable().default(null),
  ocrConfidence: z.number().min(0).max(100).nullable().default(null),
});

export type SourceSpan = z.infer<typeof sourceSpanSchema>;

export const findingDraftImportanceSchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const findingDraftProblemSchema = z.enum([
  "missing",
  "unclear",
  "conflict",
  "unsupported",
  "external_law",
]);

export const findingDraftSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable().default(null),
  note: z.string().min(1).nullable().default(null),
  sourceSpanIds: z.array(z.string().min(1)),
  importance: findingDraftImportanceSchema.default("medium"),
  problem: findingDraftProblemSchema.nullable().default(null),
  extras: z.record(z.string(), z.unknown()).default({}),
}).passthrough();

export type FindingDraft = z.infer<typeof findingDraftSchema>;

export const findingKindSchema = z.enum([
  "fact",
  "issue",
  "timeline_event",
  "missing_info",
  "obligation",
  "signature_gap",
  "document_quality",
  "out_of_scope",
]);

export const findingStatusSchema = z.enum([
  "confirmed",
  "unclear",
  "missing",
  "conflicting",
  "unsupported",
  "out_of_scope",
]);

export const materialitySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);

export const evidenceSchema = z.enum(["strong", "partial", "weak", "none"]);

export const confidenceBasisSchema = z.object({
  sourceQuality: evidenceSchema,
  ocrQuality: z.enum(["good", "mixed", "poor"]),
  ambiguity: z.enum(["none", "minor", "material"]),
});

export const findingSchema = z.object({
  id: z.string().min(1),
  kind: findingKindSchema,
  type: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  normalizedValue: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  originalText: z.string().min(1).nullable(),
  sourceSpans: z.array(sourceSpanSchema),
  status: findingStatusSchema,
  materiality: materialitySchema,
  evidenceQuality: evidenceSchema,
  confidenceBasis: confidenceBasisSchema,
  unresolvedQuestions: z.array(z.string().min(1)),
});

export type Finding = z.infer<typeof findingSchema>;

export const conflictTypeSchema = z.enum([
  "party_identity_conflict",
  "date_conflict",
  "amount_conflict",
  "deadline_conflict",
  "obligation_conflict",
  "document_version_conflict",
  "defined_term_conflict",
  "other",
]);

export const conflictSchema = z.object({
  id: z.string().min(1),
  type: conflictTypeSchema,
  field: z.string().min(1),
  competingValues: z.array(
    z.object({
      value: z.union([z.string(), z.number()]).nullable(),
      sourceSpans: z.array(sourceSpanSchema),
      relatedFindingIds: z.array(z.string().min(1)),
    }),
  ),
  materiality: z.enum(["critical", "high", "medium", "low"]),
  status: z.enum(["unresolved", "resolved", "marked_not_material"]),
});

export type Conflict = z.infer<typeof conflictSchema>;

export const reasonSchema = z.enum([
  "external_law",
  "no_source",
  "source_conflict",
  "material_conflict",
  "low_ocr",
  "missing_or_unclear",
  "partial_source",
  "final_review",
]);

export const gateSchema = z.object({
  targetId: z.string().min(1),
  targetType: z.enum(["finding", "conflict"]),
  level: z.enum([
    "G0_no_human",
    "G1_passive_flag",
    "G2_targeted_review",
    "G3_hard_gate",
  ]),
  blocking: z.boolean(),
  reasonCodes: z.array(reasonSchema),
  requiredCapability: operationalCapabilitySchema.nullable(),
  reviewQuestion: z.string().min(1).nullable(),
});

export type ReviewGate = z.infer<typeof gateSchema>;

export const reviewResolutionSchema = z.object({
  targetId: z.string().min(1),
  resolvedBy: z.string().min(1),
  decision: z.string().min(1),
  note: z.string().min(1).nullable(),
  requiredCapability: operationalCapabilitySchema.nullable(),
  timestamp: isoDateTimeSchema,
  auditStatus: z.enum(["resolved", "unresolved", "escalated"]),
});

export type ReviewResolution = z.infer<typeof reviewResolutionSchema>;

export const docSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  caseId: z.uuid().nullable(),
  ocrConversionId: z.uuid().nullable(),
  sha256: documentSha256Schema.nullable(),
  provider: ocrProviderSchema,
  providerModel: z.string().min(1),
  pageCount: z.number().int().nonnegative(),
});

export type HarnessDoc = z.infer<typeof docSchema>;

export const bundleSchema = z.object({
  version: z.literal(HARNESS_VERSION),
  docs: z.array(docSchema),
  sourceSpans: z.array(sourceSpanSchema),
  findings: z.array(findingSchema),
  conflicts: z.array(conflictSchema),
  gates: z.array(gateSchema),
  resolutions: z.array(reviewResolutionSchema),
  stats: z.object({
    docCount: z.number().int().nonnegative(),
    spanCount: z.number().int().nonnegative(),
    findingCount: z.number().int().nonnegative(),
    conflictCount: z.number().int().nonnegative(),
    gateCount: z.number().int().nonnegative(),
  }),
});

export type HarnessBundle = z.infer<typeof bundleSchema>;

export const harnessErrorSchema = z.object({
  isError: z.literal(true),
  errorCategory: z.enum([
    "configuration",
    "ocr_not_ready",
    "provider",
    "schema_validation",
    "validation",
    "unknown",
  ]),
  isRetryable: z.boolean(),
  message: z.string().min(1),
  provider: z.string().min(1).nullable(),
});

export type HarnessError = z.infer<typeof harnessErrorSchema>;
