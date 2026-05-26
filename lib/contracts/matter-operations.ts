import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";
import { operationalCapabilitySchema } from "@/lib/contracts/operational-capability";
import { reviewActionPrioritySchema } from "@/lib/contracts/review-reducer";

export const matterOperationSourceTypeSchema = z.enum([
  "review_action",
  "revision_claim",
  "procedural_requirement",
  "matter_fact",
]);

export type MatterOperationSourceType = z.infer<
  typeof matterOperationSourceTypeSchema
>;

export const matterOperationStateSchema = z.enum([
  "open",
  "in_review",
  "resolved",
  "dismissed",
  "ignored",
  "untracked",
  "superseded",
]);

export type MatterOperationState = z.infer<
  typeof matterOperationStateSchema
>;

export const matterOperationEventTypeSchema = z.enum([
  "opened",
  "resolved",
  "dismissed",
  "ignored",
  "marked_untracked",
  "superseded",
  "reopened",
  "commented",
]);

export type MatterOperationEventType = z.infer<
  typeof matterOperationEventTypeSchema
>;

export const matterOperationProvenanceRefSchema = z.object({
  kind: z.string().min(1),
  ref: z.string().min(1),
  label: z.string().min(1).nullable().default(null),
});

export type MatterOperationProvenanceRef = z.infer<
  typeof matterOperationProvenanceRefSchema
>;

export const matterOperationDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  sourceType: matterOperationSourceTypeSchema,
  sourceId: z.uuid(),
  sourceRunId: z.uuid().nullable(),
  operationKey: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  previousSourceHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  requiredCapability: operationalCapabilitySchema,
  priority: reviewActionPrioritySchema,
  blocking: z.boolean(),
  state: matterOperationStateSchema,
  current: z.boolean(),
  supersededByOperationId: z.uuid().nullable(),
  title: z.string().min(1),
  summary: z.string().min(1),
  provenanceRefs: z.array(matterOperationProvenanceRefSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type MatterOperationDto = z.infer<typeof matterOperationDtoSchema>;

export const matterOperationEventDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  operationId: z.uuid(),
  eventType: matterOperationEventTypeSchema,
  eventKey: z.string().min(1).nullable(),
  actorId: z.string().min(1).nullable(),
  note: z.string().min(1).nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: isoDateTimeSchema,
});

export type MatterOperationEventDto = z.infer<
  typeof matterOperationEventDtoSchema
>;

export const matterOperationalSnapshotDtoSchema = z.object({
  caseId: z.uuid(),
  generatedAt: isoDateTimeSchema,
  activeOperations: z.array(matterOperationDtoSchema),
  currentOperations: z.array(matterOperationDtoSchema),
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
});

export type MatterOperationalSnapshotDto = z.infer<
  typeof matterOperationalSnapshotDtoSchema
>;
