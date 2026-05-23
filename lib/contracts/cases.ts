import { z } from "zod";

export const caseStatusSchema = z.enum([
  "intake",
  "investigation",
  "review",
  "drafting",
  "filing",
  "closed",
]);

export type CaseStatus = z.infer<typeof caseStatusSchema>;

export const casePrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

export type CasePriority = z.infer<typeof casePrioritySchema>;

export const caseTypeSchema = z.enum([
  "bankruptcy",
  "immigration",
  "general",
]);

export type CaseType = z.infer<typeof caseTypeSchema>;

export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const isoDateSchema = z.iso.date();

export const caseSummaryDtoSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  type: caseTypeSchema,
  clientName: z.string().min(1).nullable(),
  status: caseStatusSchema,
  priority: casePrioritySchema,
  nextAction: z.string().min(1).nullable(),
  nextDeadlineAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

export type CaseSummaryDto = z.infer<typeof caseSummaryDtoSchema>;

export const caseParticipantRoleSchema = z.enum([
  "client",
  "attorney",
  "paralegal",
  "opposing_counsel",
  "court",
  "other",
]);

export type CaseParticipantRole = z.infer<typeof caseParticipantRoleSchema>;

export const caseParticipantDtoSchema = z.object({
  id: z.uuid(),
  role: caseParticipantRoleSchema,
  displayName: z.string().min(1),
  organizationName: z.string().min(1).nullable(),
  email: z.email().nullable(),
  phone: z.string().min(1).nullable(),
});

export type CaseParticipantDto = z.infer<typeof caseParticipantDtoSchema>;

export const caseDeadlineStatusSchema = z.enum([
  "pending",
  "blocked",
  "completed",
  "missed",
]);

export type CaseDeadlineStatus = z.infer<typeof caseDeadlineStatusSchema>;

export const caseDeadlineDtoSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  dueAt: isoDateTimeSchema,
  status: caseDeadlineStatusSchema,
  source: z.string().min(1).nullable(),
});

export type CaseDeadlineDto = z.infer<typeof caseDeadlineDtoSchema>;

export const caseTimelineEventKindSchema = z.enum([
  "intake",
  "document_uploaded",
  "ocr_completed",
  "deadline_added",
  "note_added",
  "status_changed",
]);

export type CaseTimelineEventKind = z.infer<typeof caseTimelineEventKindSchema>;

export const caseTimelineEventDtoSchema = z.object({
  id: z.uuid(),
  kind: caseTimelineEventKindSchema,
  title: z.string().min(1),
  description: z.string().min(1).nullable(),
  occurredAt: isoDateTimeSchema,
  actorDisplayName: z.string().min(1).nullable(),
});

export type CaseTimelineEventDto = z.infer<typeof caseTimelineEventDtoSchema>;

export const caseDetailDtoSchema = caseSummaryDtoSchema.extend({
  matterNumber: z.string().min(1).nullable(),
  courtName: z.string().min(1).nullable(),
  practiceArea: z.string().min(1).nullable(),
  openedAt: isoDateSchema.nullable(),
  participants: z.array(caseParticipantDtoSchema),
  deadlines: z.array(caseDeadlineDtoSchema),
  timeline: z.array(caseTimelineEventDtoSchema),
});

export type CaseDetailDto = z.infer<typeof caseDetailDtoSchema>;

export const createCaseInputSchema = z.object({
  title: z.string().min(1),
  clientName: z.string().min(1).nullable().default(null),
  type: caseTypeSchema.default("general"),
  status: caseStatusSchema.default("intake"),
  priority: casePrioritySchema.default("normal"),
  practiceArea: z.string().min(1).nullable().default(null),
});

export type CreateCaseInput = z.input<typeof createCaseInputSchema>;

export const updateCaseInputSchema = z.object({
  caseId: z.uuid(),
  title: z.string().min(1).optional(),
  clientName: z.string().min(1).nullable().optional(),
  type: caseTypeSchema.optional(),
  status: caseStatusSchema.optional(),
  priority: casePrioritySchema.optional(),
  nextAction: z.string().min(1).nullable().optional(),
});

export type UpdateCaseInput = z.input<typeof updateCaseInputSchema>;

export const listCasesInputSchema = z.object({
  status: caseStatusSchema.optional(),
  type: caseTypeSchema.optional(),
  priority: casePrioritySchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z
    .object({
      updatedAt: isoDateTimeSchema,
      id: z.uuid(),
    })
    .nullable()
    .default(null),
});

export type ListCasesInput = z.input<typeof listCasesInputSchema>;
