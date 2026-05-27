import { z } from "zod";

import {
  reviewWorkItemFamilySchema,
  reviewWorkItemPrioritySchema,
  type ReviewWorkItemDraft,
  type ReviewWorkItemFamily,
  type ReviewWorkItemPriority,
} from "@/lib/contracts/review-work-item";

export const REVIEW_REDUCER_VERSION = "review-reducer.v1";
export const REVIEW_REDUCER_SCHEMA_NAME = "murdock_review_reducer_v1";

export const reviewActionKindSchema = reviewWorkItemFamilySchema;

export type ReviewActionKind = ReviewWorkItemFamily;

export const reviewActionPrioritySchema = reviewWorkItemPrioritySchema;

export type ReviewActionPriority = ReviewWorkItemPriority;

export const reviewActionRawRefSchema = z.object({
  kind: z.enum([
    "workspace_issue",
    "harness_finding",
    "harness_conflict",
    "harness_gate",
    "revision_claim",
  ]),
  id: z.string().min(1),
  key: z.string().min(1).nullable().default(null),
  label: z.string().min(1).nullable().default(null),
  runId: z.uuid().nullable().default(null),
  sourceKey: z.string().min(1).nullable().default(null),
});

export type ReviewActionRawRef = z.infer<typeof reviewActionRawRefSchema>;

export const reviewReducerCandidateSchema = z.object({
  candidateKey: z.string().min(1),
  actionLabel: z.string().min(1),
  blocking: z.boolean(),
  kind: reviewActionKindSchema,
  priority: reviewActionPrioritySchema,
  rawRefs: z.array(reviewActionRawRefSchema).min(1),
  sourceSpanIds: z.array(z.uuid()),
  summary: z.string().min(1),
  title: z.string().min(1),
});

export type ReviewReducerCandidate = z.infer<
  typeof reviewReducerCandidateSchema
>;

export const reviewReducerModelActionSchema = z.object({
  actionLabel: z.string().min(1),
  blocking: z.boolean(),
  candidateKeys: z.array(z.string().min(1)).min(1),
  kind: reviewActionKindSchema,
  priority: reviewActionPrioritySchema,
  summary: z.string().min(1),
  title: z.string().min(1),
});

export type ReviewReducerModelAction = z.infer<
  typeof reviewReducerModelActionSchema
>;

export const reviewReducerModelOutputSchema = z.object({
  actions: z.array(reviewReducerModelActionSchema),
});

export type ReviewReducerModelOutput = z.infer<
  typeof reviewReducerModelOutputSchema
>;

export const reviewReducerRunStatusSchema = z.enum([
  "running",
  "succeeded",
  "fallback",
  "failed",
]);

export type ReviewReducerRunStatus = z.infer<
  typeof reviewReducerRunStatusSchema
>;

export const reviewReducerValidationErrorSchema = z.object({
  message: z.string().min(1),
});

export type ReviewReducerValidationError = z.infer<
  typeof reviewReducerValidationErrorSchema
>;

export const reviewReducerRunMetadataSchema = z.object({
  actionCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  fallback: z.boolean(),
  reducerRunId: z.uuid(),
  status: reviewReducerRunStatusSchema.exclude(["running"]),
  validationErrors: z.array(reviewReducerValidationErrorSchema),
});

export type ReviewReducerRunMetadata = z.infer<
  typeof reviewReducerRunMetadataSchema
>;

export type MaterializedReviewAction = ReviewWorkItemDraft;
