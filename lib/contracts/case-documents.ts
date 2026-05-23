import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";

export const caseDocumentStatusSchema = z.enum([
  "uploaded",
  "processing",
  "ready",
  "needs_review",
  "failed",
]);

export type CaseDocumentStatus = z.infer<typeof caseDocumentStatusSchema>;

export const caseDocumentKindSchema = z.enum([
  "intake",
  "pleading",
  "motion",
  "order",
  "correspondence",
  "evidence",
  "other",
]);

export type CaseDocumentKind = z.infer<typeof caseDocumentKindSchema>;

export const caseDocumentSummaryDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  fileName: z.string().min(1),
  title: z.string().min(1),
  kind: caseDocumentKindSchema,
  status: caseDocumentStatusSchema,
  uploadedAt: isoDateTimeSchema,
  uploadedByDisplayName: z.string().min(1).nullable(),
});

export type CaseDocumentSummaryDto = z.infer<typeof caseDocumentSummaryDtoSchema>;

export const caseDocumentOcrDtoSchema = z.object({
  markdown: z.string(),
  model: z.string().min(1),
  pagesProcessed: z.number().int().nonnegative(),
  processedAt: isoDateTimeSchema,
});

export type CaseDocumentOcrDto = z.infer<typeof caseDocumentOcrDtoSchema>;

export const caseDocumentDetailDtoSchema = caseDocumentSummaryDtoSchema.extend({
  storageKey: z.string().min(1).nullable(),
  mimeType: z.string().min(1).nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  ocr: caseDocumentOcrDtoSchema.nullable(),
});

export type CaseDocumentDetailDto = z.infer<typeof caseDocumentDetailDtoSchema>;

export const createCaseDocumentInputSchema = z.object({
  caseId: z.uuid(),
  fileName: z.string().min(1),
  title: z.string().min(1),
  kind: caseDocumentKindSchema.default("other"),
});

export type CreateCaseDocumentInput = z.input<typeof createCaseDocumentInputSchema>;
