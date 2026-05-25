import { z } from "zod";

export const casePrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

export type CasePriority = z.infer<typeof casePrioritySchema>;

export const caseTypeSchema = z.enum([
  "bankruptcy",
  "immigration",
  "general",
]);

export type CaseType = z.infer<typeof caseTypeSchema>;

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const caseSummaryDtoSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  type: caseTypeSchema,
  clientName: z.string().min(1).nullable(),
  priority: casePrioritySchema,
  nextAction: z.string().min(1).nullable(),
  nextDeadlineAt: isoDateTimeSchema.nullable(),
  updatedAt: isoDateTimeSchema,
});

export type CaseSummaryDto = z.infer<typeof caseSummaryDtoSchema>;

export const createCaseInputSchema = z.object({
  title: z.string().min(1),
  clientName: z.string().min(1).nullable().default(null),
  type: caseTypeSchema.default("general"),
  priority: casePrioritySchema.default("normal"),
  practiceArea: z.string().min(1).nullable().default(null),
});

export type CreateCaseInput = z.input<typeof createCaseInputSchema>;

export const updateCaseInputSchema = z.object({
  caseId: z.uuid(),
  title: z.string().min(1).optional(),
  clientName: z.string().min(1).nullable().optional(),
  type: caseTypeSchema.optional(),
  priority: casePrioritySchema.optional(),
  nextAction: z.string().min(1).nullable().optional(),
});

export type UpdateCaseInput = z.input<typeof updateCaseInputSchema>;

export const listCasesInputSchema = z.object({
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
