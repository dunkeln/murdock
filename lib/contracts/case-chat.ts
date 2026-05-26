import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";

export const caseChatMessageRoleSchema = z.enum(["user", "assistant"]);
export type CaseChatMessageRole = z.infer<typeof caseChatMessageRoleSchema>;

export const caseChatMessageStatusSchema = z.enum([
  "pending",
  "streaming",
  "completed",
  "failed",
]);
export type CaseChatMessageStatus = z.infer<typeof caseChatMessageStatusSchema>;

export const caseChatTraceEventSchema = z.object({
  label: z.string().min(1),
  status: z.enum(["started", "completed"]),
});
export type CaseChatTraceEvent = z.infer<typeof caseChatTraceEventSchema>;

export const caseChatThreadDtoSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  userId: z.string().min(1),
  status: z.enum(["active", "archived"]),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CaseChatThreadDto = z.infer<typeof caseChatThreadDtoSchema>;

export const caseChatMessageDtoSchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  caseId: z.uuid(),
  userId: z.string().min(1),
  role: caseChatMessageRoleSchema,
  status: caseChatMessageStatusSchema,
  content: z.string(),
  contextTrace: z.array(caseChatTraceEventSchema),
  provider: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CaseChatMessageDto = z.infer<typeof caseChatMessageDtoSchema>;

export const caseChatSummaryDtoSchema = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  caseId: z.uuid(),
  userId: z.string().min(1),
  coveredThroughMessageId: z.uuid(),
  summary: z.string().min(1),
  tokenEstimate: z.number().int().nonnegative(),
  provider: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  createdAt: isoDateTimeSchema,
});
export type CaseChatSummaryDto = z.infer<typeof caseChatSummaryDtoSchema>;

export const caseChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("user_message_saved"),
    message: caseChatMessageDtoSchema,
  }),
  z.object({
    type: z.literal("context_trace"),
    event: caseChatTraceEventSchema,
  }),
  z.object({
    type: z.literal("assistant_delta"),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("assistant_done"),
    message: caseChatMessageDtoSchema,
  }),
  z.object({
    type: z.literal("error"),
    message: z.string().min(1),
  }),
]);
export type CaseChatStreamEvent = z.infer<typeof caseChatStreamEventSchema>;
