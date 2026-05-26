import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type {
  CaseChatMessageDto,
  CaseChatSummaryDto,
  CaseChatThreadDto,
  CaseChatTraceEvent,
} from "@/lib/contracts/case-chat";
import { getCurrentUser } from "@/lib/server/auth/current-user";
import { getCaseSummaryByUserAndId } from "@/lib/server/cases/repository";
import {
  getLatestCaseChatSummary,
  getOrCreateCaseChatThread,
  insertCaseChatMessage,
  insertCaseChatSummary,
  listCaseChatMessages,
  updateCaseChatMessage,
} from "@/lib/server/case-chat/repository";
import { generateObject } from "@/lib/server/ai/generate-object";

const summaryPromptPath = join(
  process.cwd(),
  "prompts",
  "case-chat-summary-v1.md",
);

const summarySchema = z.object({
  summary: z.string().min(1),
});

export type CaseChatLoadResult =
  | {
      messages: CaseChatMessageDto[];
      ok: true;
      summary: CaseChatSummaryDto | null;
      thread: CaseChatThreadDto;
    }
  | {
      errorCategory: "not_found" | "configuration" | "provider" | "unknown";
      isRetryable: boolean;
      message: string;
      ok: false;
    };

export type CaseChatMemory = {
  messages: CaseChatMessageDto[];
  summary: CaseChatSummaryDto | null;
  thread: CaseChatThreadDto;
};

async function summaryPrompt() {
  return readFile(summaryPromptPath, "utf8");
}

export function estimateCaseChatTokens(value: unknown) {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function caseChatTokenBudget() {
  const value = Number(process.env.CASE_CHAT_CONTEXT_TOKEN_BUDGET ?? 6000);

  return Number.isFinite(value) && value > 1000 ? value : 6000;
}

function retainedMessageCount() {
  const value = Number(process.env.CASE_CHAT_RETAINED_MESSAGE_COUNT ?? 8);

  return Number.isInteger(value) && value >= 4 ? value : 8;
}

function toChatMemoryMessage(message: CaseChatMessageDto) {
  return {
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
  };
}

async function requireCurrentUserCase(input: { caseId: string }) {
  const user = await getCurrentUser();
  const caseSummary = await getCaseSummaryByUserAndId({
    caseId: input.caseId,
    userId: user.id,
  });

  if (!caseSummary) {
    return {
      ok: false as const,
      errorCategory: "not_found" as const,
      isRetryable: false,
      message: "Case not found.",
    };
  }

  return {
    ok: true as const,
    caseSummary,
    user,
  };
}

export async function loadCurrentUserCaseChat(input: {
  caseId: string;
}): Promise<CaseChatLoadResult> {
  try {
    const caseAccess = await requireCurrentUserCase(input);

    if (!caseAccess.ok) {
      return caseAccess;
    }

    const thread = await getOrCreateCaseChatThread({
      caseId: input.caseId,
      userId: caseAccess.user.id,
    });
    const summary = await getLatestCaseChatSummary({ threadId: thread.id });
    const messages = await listCaseChatMessages({
      threadId: thread.id,
      afterMessageId: summary?.coveredThroughMessageId ?? null,
    });

    return {
      ok: true,
      messages,
      summary,
      thread,
    };
  } catch (error) {
    return {
      ok: false,
      errorCategory:
        error instanceof Error && error.message.includes("NEON_CONN_URL")
          ? "configuration"
          : "unknown",
      isRetryable: false,
      message:
        error instanceof Error ? error.message : "Case chat could not be loaded.",
    };
  }
}

export async function createCurrentUserCaseChatUserMessage(input: {
  caseId: string;
  content: string;
}) {
  const caseAccess = await requireCurrentUserCase({ caseId: input.caseId });

  if (!caseAccess.ok) {
    return caseAccess;
  }

  const thread = await getOrCreateCaseChatThread({
    caseId: input.caseId,
    userId: caseAccess.user.id,
  });
  const message = await insertCaseChatMessage({
    caseId: input.caseId,
    content: input.content,
    role: "user",
    status: "completed",
    threadId: thread.id,
    userId: caseAccess.user.id,
  });

  return {
    ok: true as const,
    message,
    thread,
    user: caseAccess.user,
  };
}

export async function createStreamingAssistantMessage(input: {
  caseId: string;
  threadId: string;
  userId: string;
}) {
  return insertCaseChatMessage({
    caseId: input.caseId,
    content: "",
    role: "assistant",
    status: "streaming",
    threadId: input.threadId,
    userId: input.userId,
  });
}

export async function completeAssistantMessage(input: {
  content: string;
  contextTrace: CaseChatTraceEvent[];
  inputTokens: number | null;
  messageId: string;
  model: string | null;
  outputTokens: number | null;
  provider: string | null;
}) {
  return updateCaseChatMessage({
    content: input.content,
    contextTrace: input.contextTrace,
    inputTokens: input.inputTokens,
    messageId: input.messageId,
    model: input.model,
    outputTokens: input.outputTokens,
    provider: input.provider,
    status: "completed",
  });
}

export async function failAssistantMessage(input: {
  error: Record<string, unknown>;
  messageId: string;
}) {
  return updateCaseChatMessage({
    error: input.error,
    messageId: input.messageId,
    status: "failed",
  });
}

export async function prepareCaseChatMemory(input: {
  thread: CaseChatThreadDto;
}): Promise<CaseChatMemory> {
  const latestSummary = await getLatestCaseChatSummary({
    threadId: input.thread.id,
  });
  const messages = await listCaseChatMessages({
    threadId: input.thread.id,
    afterMessageId: latestSummary?.coveredThroughMessageId ?? null,
  });
  const estimate = estimateCaseChatTokens({
    summary: latestSummary?.summary ?? null,
    messages: messages.map(toChatMemoryMessage),
  });

  if (estimate <= caseChatTokenBudget() || messages.length <= retainedMessageCount()) {
    return {
      messages,
      summary: latestSummary,
      thread: input.thread,
    };
  }

  const retainedCount = retainedMessageCount();
  const messagesToSummarize = messages.slice(0, -retainedCount);
  const retainedMessages = messages.slice(-retainedCount);
  const coveredThroughMessage = messagesToSummarize.at(-1);

  if (!coveredThroughMessage) {
    return {
      messages,
      summary: latestSummary,
      thread: input.thread,
    };
  }

  const result = await generateObject({
    allowFallback: false,
    maxOutputTokens: 900,
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          {
            priorSummary: latestSummary?.summary ?? null,
            messages: messagesToSummarize.map(toChatMemoryMessage),
          },
          null,
          2,
        ),
      },
    ],
    preferredProvider: "anthropic",
    schema: summarySchema,
    schemaDescription: "Compact older case chat messages into hidden memory.",
    schemaName: "murdock_case_chat_summary_v1",
    system: await summaryPrompt(),
    temperature: 0,
    use: "workspace-query",
  });

  if (!result.ok) {
    return {
      messages,
      summary: latestSummary,
      thread: input.thread,
    };
  }

  const summary = await insertCaseChatSummary({
    caseId: input.thread.caseId,
    coveredThroughMessageId: coveredThroughMessage.id,
    inputTokens: result.usage.inputTokens,
    model: result.model,
    outputTokens: result.usage.outputTokens,
    provider: result.provider,
    summary: result.data.summary,
    threadId: input.thread.id,
    tokenEstimate: estimateCaseChatTokens(result.data.summary),
    userId: input.thread.userId,
  });

  return {
    messages: retainedMessages,
    summary,
    thread: input.thread,
  };
}
