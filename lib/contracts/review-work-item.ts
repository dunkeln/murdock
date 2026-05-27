import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";
import type { OperationalCapability } from "@/lib/contracts/operational-capability";

export const reviewWorkItemFamilySchema = z.enum([
  "conflict",
  "revision",
  "timeline",
  "missing",
  "source_check",
]);

export type ReviewWorkItemFamily = z.infer<
  typeof reviewWorkItemFamilySchema
>;

export const reviewWorkItemKindSchema = z.object({
  code: z.string().min(1),
  family: reviewWorkItemFamilySchema,
});

export type ReviewWorkItemKind = z.infer<typeof reviewWorkItemKindSchema>;

export const reviewWorkItemPrioritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
]);

export type ReviewWorkItemPriority = z.infer<
  typeof reviewWorkItemPrioritySchema
>;

export const reviewWorkItemStatusSchema = z.enum([
  "open",
  "resolved",
  "dismissed",
]);

export type ReviewWorkItemStatus = z.infer<typeof reviewWorkItemStatusSchema>;

export const reviewWorkItemProvenanceRefSchema = z.object({
  kind: z.string().min(1),
  ref: z.string().min(1),
  key: z.string().min(1).nullable().default(null),
  label: z.string().min(1).nullable().default(null),
  runId: z.uuid().nullable().default(null),
  sourceKey: z.string().min(1).nullable().default(null),
});

export type ReviewWorkItemProvenanceRef = z.infer<
  typeof reviewWorkItemProvenanceRefSchema
>;

export const reviewWorkItemOriginSchema = z.object({
  sourceRunId: z.uuid().nullable().default(null),
  sourceType: z.enum([
    "review_reducer",
    "workspace_issue",
    "document_revision",
  ]),
});

export type ReviewWorkItemOrigin = z.infer<
  typeof reviewWorkItemOriginSchema
>;

export const reviewWorkItemEventTypeSchema = z.enum([
  "comment",
  "resolve",
  "dismiss",
  "reopen",
]);

export type ReviewWorkItemEventType = z.infer<
  typeof reviewWorkItemEventTypeSchema
>;

export const reviewWorkItemCoreSchema = z.object({
  blocking: z.boolean(),
  key: z.string().min(1),
  kind: reviewWorkItemKindSchema,
  priority: reviewWorkItemPrioritySchema,
  provenanceRefs: z.array(reviewWorkItemProvenanceRefSchema),
  reviewPrompt: z.string().min(1),
  sourceSpanIds: z.array(z.uuid()),
  status: reviewWorkItemStatusSchema,
  summary: z.string().min(1),
  title: z.string().min(1),
});

export type ReviewWorkItemCore = z.infer<typeof reviewWorkItemCoreSchema>;

export const reviewWorkItemDraftSchema = reviewWorkItemCoreSchema.extend({
  origin: reviewWorkItemOriginSchema,
});

export type ReviewWorkItemDraft = z.infer<typeof reviewWorkItemDraftSchema>;

export const reviewWorkItemSchema = reviewWorkItemDraftSchema.extend({
  caseId: z.uuid(),
  createdAt: isoDateTimeSchema,
  id: z.uuid(),
  resolvedAt: isoDateTimeSchema.nullable().default(null),
  updatedAt: isoDateTimeSchema,
});

export type ReviewWorkItem = z.infer<typeof reviewWorkItemSchema>;

export function deriveReviewWorkItemCapability(
  item: Pick<ReviewWorkItemCore, "blocking" | "kind">,
): OperationalCapability {
  if (item.kind.family === "conflict") {
    return "legal_judgment";
  }

  if (item.kind.family === "revision") {
    return "document_version_review";
  }

  if (item.kind.family === "timeline") {
    return "timeline_management";
  }

  if (item.kind.family === "source_check") {
    return "source_verification";
  }

  return item.blocking ? "factual_completion" : "operational_followup";
}

export function reviewWorkItemStatusAfterEvent(input: {
  currentStatus: ReviewWorkItemStatus;
  eventType: ReviewWorkItemEventType;
}) {
  if (input.eventType === "resolve") {
    return "resolved" as const;
  }

  if (input.eventType === "dismiss") {
    return "dismissed" as const;
  }

  if (input.eventType === "reopen") {
    return "open" as const;
  }

  return input.currentStatus;
}

export function reviewActionEventToWorkItemEvent(
  eventType: "comment" | "resolved" | "dismissed" | "reopened",
): ReviewWorkItemEventType {
  if (eventType === "resolved") {
    return "resolve";
  }

  if (eventType === "dismissed") {
    return "dismiss";
  }

  if (eventType === "reopened") {
    return "reopen";
  }

  return "comment";
}
