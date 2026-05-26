import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";

export const revisionChangeTypeSchema = z.enum([
  "added",
  "removed",
  "changed",
  "unchanged_with_new_source",
]);

export type RevisionChangeType = z.infer<typeof revisionChangeTypeSchema>;

export const revisionClaimStatusSchema = z.enum([
  "candidate",
  "confirmed",
  "dismissed",
]);

export type RevisionClaimStatus = z.infer<typeof revisionClaimStatusSchema>;

export const revisionClaimConfidenceSchema = z.enum(["low", "medium", "high"]);

export type RevisionClaimConfidence = z.infer<
  typeof revisionClaimConfidenceSchema
>;

export const documentFamilyDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  familyKey: z.string().min(1),
  label: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type DocumentFamilyDto = z.infer<typeof documentFamilyDtoSchema>;

export const documentVersionDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  documentFamilyId: z.uuid(),
  sourceDocumentId: z.uuid(),
  caseDocumentId: z.uuid().nullable(),
  versionIndex: z.number().int().positive(),
  label: z.string().min(1),
  snapshotJson: z.record(z.string(), z.unknown()),
  snapshotText: z.string().min(1),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  uploadedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type DocumentVersionDto = z.infer<typeof documentVersionDtoSchema>;

export const documentRevisionClaimDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  documentFamilyId: z.uuid(),
  fromDocumentVersionId: z.uuid(),
  toDocumentVersionId: z.uuid(),
  fieldPath: z.string().min(1),
  fieldLabel: z.string().min(1),
  changeType: revisionChangeTypeSchema,
  beforeValue: z.unknown().nullable(),
  afterValue: z.unknown().nullable(),
  beforeSourceSpanIds: z.array(z.uuid()),
  afterSourceSpanIds: z.array(z.uuid()),
  confidence: revisionClaimConfidenceSchema,
  status: revisionClaimStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type DocumentRevisionClaimDto = z.infer<
  typeof documentRevisionClaimDtoSchema
>;

export const documentRevisionSummaryDtoSchema = z.object({
  documentFamilyId: z.uuid(),
  documentLabel: z.string().min(1),
  fromSourceDocumentId: z.uuid(),
  fromVersionLabel: z.string().min(1),
  toSourceDocumentId: z.uuid(),
  toVersionLabel: z.string().min(1),
  claims: z.array(documentRevisionClaimDtoSchema),
});

export type DocumentRevisionSummaryDto = z.infer<
  typeof documentRevisionSummaryDtoSchema
>;
