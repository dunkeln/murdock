import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";

export const operationalSignalTypeSchema = z.enum([
  "document_added",
  "document_changed",
  "review_action_opened",
  "review_action_resolved",
  "review_action_dismissed",
]);

export type OperationalSignalType = z.infer<typeof operationalSignalTypeSchema>;

export const operationalSignalImportanceSchema = z.enum([
  "low",
  "medium",
  "high",
  "blocking",
]);

export type OperationalSignalImportance = z.infer<
  typeof operationalSignalImportanceSchema
>;

export const operationalSignalStateSchema = z.enum([
  "active",
  "resolved",
  "dismissed",
  "informational",
]);

export type OperationalSignalState = z.infer<typeof operationalSignalStateSchema>;

export const operationalSignalGeneratedBySchema = z.enum([
  "document_ingestion",
  "document_revision",
  "review_reducer",
]);

export type OperationalSignalGeneratedBy = z.infer<
  typeof operationalSignalGeneratedBySchema
>;

export const operationalSignalSourceRefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "source_document",
    "source_span",
    "revision_claim",
    "review_action",
    "raw_ref",
  ]),
  label: z.string().min(1).nullable(),
});

export type OperationalSignalSourceRef = z.infer<
  typeof operationalSignalSourceRefSchema
>;

export const operationalSignalDtoSchema = z.object({
  actorId: z.string().min(1).nullable(),
  actorType: z.enum(["system", "user", "external"]),
  caseId: z.uuid(),
  generatedBy: operationalSignalGeneratedBySchema,
  id: z.string().min(1),
  importance: operationalSignalImportanceSchema,
  observedAt: isoDateTimeSchema,
  occurredAt: isoDateTimeSchema.nullable(),
  signalType: operationalSignalTypeSchema,
  sourceRefs: z.array(operationalSignalSourceRefSchema),
  sourceSpanIds: z.array(z.uuid()),
  state: operationalSignalStateSchema,
  summary: z.string().min(1),
  title: z.string().min(1),
});

export type OperationalSignalDto = z.infer<typeof operationalSignalDtoSchema>;
