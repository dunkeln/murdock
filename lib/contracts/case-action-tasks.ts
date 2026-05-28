import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";
import { reviewWorkItemPrioritySchema } from "@/lib/contracts/review-work-item";

export const caseActionTaskKindSchema = z.enum([
  "request_information",
  "request_document",
  "notify_client",
  "verify_source",
  "mark_for_case_team_review",
  "prepare_draft",
  "prepare_redline",
  "update_checklist",
  "calendar_deadline",
  "calculate_amount",
  "record_time",
  "file_or_submit",
  "dismiss_review_item",
]);

export const caseActionTaskActorSchema = z.enum([
  "client",
  "case_team",
  "court_or_agency",
  "counterparty",
  "third_party",
  "system",
]);

export const caseActionTaskStatusSchema = z.enum([
  "queued",
  "in_progress",
  "blocked",
  "done",
  "dismissed",
]);

export const caseActionTaskSourceSchema = z.enum([
  "reviewer_choice",
  "custom_user_step",
  "dismissal_request",
  "agent_memory",
]);

export const caseActionTaskSchema = z.object({
  actor: caseActionTaskActorSchema,
  caseId: z.uuid(),
  connectorHint: z.string().min(1).nullable(),
  createdAt: isoDateTimeSchema,
  createdBy: z.string().min(1).nullable(),
  description: z.string().min(1),
  id: z.uuid(),
  kind: caseActionTaskKindSchema,
  priority: reviewWorkItemPrioritySchema,
  provenanceRefs: z.array(z.unknown()),
  sourceReviewRefs: z.array(z.string().min(1)),
  sourceSpanRefs: z.array(z.string().min(1)),
  sourceType: caseActionTaskSourceSchema,
  status: caseActionTaskStatusSchema,
  taskKey: z.string().min(1),
  title: z.string().min(1),
  updatedAt: isoDateTimeSchema,
});

export type CaseActionTask = z.infer<typeof caseActionTaskSchema>;
export type CaseActionTaskActor = z.infer<typeof caseActionTaskActorSchema>;
export type CaseActionTaskKind = z.infer<typeof caseActionTaskKindSchema>;
export type CaseActionTaskStatus = z.infer<typeof caseActionTaskStatusSchema>;
export type CaseActionTaskSource = z.infer<typeof caseActionTaskSourceSchema>;
