import type { AGUIEvent } from "@ag-ui/core";
import { EventSchemas } from "@ag-ui/core";
import { z } from "zod";

import {
  caseWorkspaceIssueSeveritySchema,
  caseWorkspaceIssueTypeSchema,
} from "@/lib/contracts/case-workspace";

export const controlStatusSchema = z.enum([
  "idle",
  "ocr_processing",
  "shaping_pending",
  "shaping_started",
  "ready",
  "needs_review",
  "failed",
]);

export type ControlStatus = z.infer<typeof controlStatusSchema>;

export const controlActionKindSchema = z.enum([
  "review_issue",
  "inspect_provenance",
  "continue_chronology",
  "review_facts",
  "needs_review",
]);

export type ControlActionKind = z.infer<typeof controlActionKindSchema>;

export const controlActionSchema = z.object({
  id: z.string().min(1),
  kind: controlActionKindSchema,
  label: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1).nullable(),
  severity: caseWorkspaceIssueSeveritySchema.nullable(),
  issueType: caseWorkspaceIssueTypeSchema.nullable(),
  relatedIssueId: z.uuid().nullable(),
  sourceSpanIds: z.array(z.uuid()),
});

export type ControlAction = z.infer<typeof controlActionSchema>;

export const workspaceControlStateSchema = z.object({
  caseId: z.uuid(),
  status: controlStatusSchema,
  summary: z.object({
    sourceCount: z.number().int().nonnegative(),
    factCount: z.number().int().nonnegative(),
    chronologyEventCount: z.number().int().nonnegative(),
    issueCount: z.number().int().nonnegative(),
    highSeverityIssueCount: z.number().int().nonnegative(),
  }),
  actions: z.array(controlActionSchema),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type WorkspaceControlState = z.infer<typeof workspaceControlStateSchema>;

export const controlCustomEventNameSchema = z.enum([
  "murdock.control.reveal",
  "murdock.provenance.expand",
]);

export type ControlCustomEventName = z.infer<
  typeof controlCustomEventNameSchema
>;

export function parseAguiEvent(value: unknown): AGUIEvent {
  return EventSchemas.parse(value) as AGUIEvent;
}

export function parseAguiEvents(values: unknown[]): AGUIEvent[] {
  return values.map(parseAguiEvent);
}
