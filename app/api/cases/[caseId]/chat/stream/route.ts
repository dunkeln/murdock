import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { CaseChatStreamEvent } from "@/lib/contracts/case-chat";
import type { Usage } from "@/lib/server/ai/types";
import {
  completeAssistantMessage,
  createCurrentUserCaseChatUserMessage,
  createStreamingAssistantMessage,
  failAssistantMessage,
  prepareCaseChatMemory,
} from "@/lib/server/case-chat/service";
import { prepareWorkspaceMcpContext } from "@/lib/server/case-workspace/query";
import { streamText } from "@/lib/server/ai/stream-text";
import {
  withLangfuseGeneration,
  withLangfuseObservation,
  withLangfuseTrace,
} from "@/lib/server/telemetry/langfuse";

export const runtime = "nodejs";

const promptPath = join(process.cwd(), "prompts", "case-chat-answer-v1.md");
const runtimePromptName = "case-chat-answer-v1";
const runtimePromptLabel = process.env.LANGFUSE_RUNTIME_PROMPT_LABEL ?? "local";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

async function prompt() {
  return readFile(promptPath, "utf8");
}

function sse(event: CaseChatStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function memoryForModel(memory: Awaited<ReturnType<typeof prepareCaseChatMemory>>) {
  return {
    summary: memory.summary?.summary ?? null,
    recentMessages: memory.messages.map((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
  };
}

function nonNullUsageDetails(usage: Usage) {
  return Object.fromEntries(
    Object.entries({
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheCreationInput: usage.cacheCreationInputTokens,
      cacheReadInput: usage.cacheReadInputTokens,
    }).filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

function mcpContextTelemetry(
  result: Awaited<ReturnType<typeof prepareWorkspaceMcpContext>>,
) {
  if (!result.ok) {
    return {
      contextOk: false,
      errorCategory: result.errorCategory,
      selectedToolCount: 0,
    };
  }

  const labels = result.mcpToolResults.map((item) => item.contextLabel);
  const actionQueueResult = result.mcpToolResults.find(
    (item) => item.contextLabel === "Checked task queue",
  );
  const actionQueueSize =
    actionQueueResult?.ok &&
    actionQueueResult.data &&
    typeof actionQueueResult.data === "object" &&
    "tasks" in actionQueueResult.data &&
    Array.isArray(actionQueueResult.data.tasks)
      ? actionQueueResult.data.tasks.length
      : 0;

  return {
    actionQueueSize,
    contextOk: true,
    contextTraceEvents: result.contextTrace.length,
    hasActionQueue: Boolean(actionQueueResult),
    selectedToolCount: result.mcpToolResults.length,
    selectedTools: labels.join(",").slice(0, 200),
    successfulToolCount: result.mcpToolResults.filter((item) => item.ok).length,
  };
}

export async function POST(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  const parsedBody = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsedBody.success) {
    return new Response(
      sse({
        type: "error",
        message: "Send a non-empty chat message.",
      }),
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/event-stream; charset=utf-8",
        },
        status: 400,
      },
    );
  }

  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        let assistantMessageId: string | null = null;
        let assistantText = "";
        let closed = false;
        const write = (event: CaseChatStreamEvent) => {
          if (closed) {
            return;
          }

          controller.enqueue(encoder.encode(sse(event)));
        };
        const close = () => {
          if (closed) {
            return;
          }

          closed = true;
          controller.close();
        };

        try {
          const userMessageResult = await createCurrentUserCaseChatUserMessage({
            caseId,
            content: parsedBody.data.message,
          });

          if (!userMessageResult.ok) {
            write({
              type: "error",
              message: userMessageResult.message,
            });
            close();
            return;
          }

          write({
            type: "user_message_saved",
            message: userMessageResult.message,
          });

          await withLangfuseTrace(
            {
              name: "case.runtime_chat",
              userId: userMessageResult.user.id,
              sessionId: `case:${caseId}:thread:${userMessageResult.thread.id}`,
              tags: [
                "feature:runtime-chat",
                "agent:runtime",
                "surface:case-chat",
                "harness:v3",
              ],
              input: {
                caseId,
                messageLength: parsedBody.data.message.length,
              },
              metadata: {
                caseId,
                promptLabel: runtimePromptLabel,
                promptName: runtimePromptName,
                surface: "case-chat",
                threadId: userMessageResult.thread.id,
              },
              output: (result) => result,
            },
            async () => {
              const memory = await withLangfuseObservation(
                {
                  name: "runtime.memory.load",
                  metadata: {
                    caseId,
                    threadId: userMessageResult.thread.id,
                  },
                  output: (result) => ({
                    hasSummary: Boolean(result.summary),
                    recentMessages: result.messages.length,
                  }),
                },
                async () =>
                  prepareCaseChatMemory({
                    thread: userMessageResult.thread,
                  }),
              );
              const mcpContext = await withLangfuseObservation(
                {
                  name: "runtime.context.select",
                  input: {
                    caseId,
                    messageLength: parsedBody.data.message.length,
                  },
                  metadata: {
                    caseId,
                    threadId: userMessageResult.thread.id,
                  },
                  output: mcpContextTelemetry,
                },
                async () =>
                  prepareWorkspaceMcpContext({
                    caseId,
                    question: parsedBody.data.message,
                    subscriber: (event) => {
                      write({
                        type: "context_trace",
                        event,
                      });
                    },
                  }),
              );

              if (!mcpContext.ok) {
                write({
                  type: "error",
                  message: mcpContext.message,
                });
                close();
                return {
                  errorCategory: mcpContext.errorCategory,
                  ok: false,
                  stage: "context",
                };
              }

              const assistantMessage = await withLangfuseObservation(
                {
                  name: "runtime.message.create",
                  metadata: {
                    caseId,
                    threadId: userMessageResult.thread.id,
                  },
                  output: (message) => ({
                    messageId: message.id,
                  }),
                },
                async () =>
                  createStreamingAssistantMessage({
                    caseId,
                    threadId: userMessageResult.thread.id,
                    userId: userMessageResult.user.id,
                  }),
              );
              assistantMessageId = assistantMessage.id;

              const streamResult = await withLangfuseGeneration(
                {
                  name: "runtime.model.stream",
                  input: {
                    contextResultCount: mcpContext.mcpToolResults.length,
                    hasConversationSummary: Boolean(memory.summary),
                    maxOutputTokens: 1200,
                    messageLength: parsedBody.data.message.length,
                    promptLabel: runtimePromptLabel,
                    promptName: runtimePromptName,
                    temperature: 0,
                  },
                  metadata: {
                    caseId,
                    promptLabel: runtimePromptLabel,
                    promptName: runtimePromptName,
                    selectedToolCount: mcpContext.mcpToolResults.length,
                    threadId: userMessageResult.thread.id,
                  },
                  generation: (result) =>
                    result.ok
                      ? {
                          model: result.model,
                          modelParameters: {
                            maxOutputTokens: 1200,
                            temperature: 0,
                          },
                          usageDetails: nonNullUsageDetails(result.usage),
                        }
                      : {},
                  output: (result) =>
                    result.ok
                      ? {
                          model: result.model,
                          ok: true,
                          outputLength: result.data.length,
                          provider: result.provider,
                          usage: result.usage,
                        }
                      : {
                          errorCategory: result.error.errorCategory,
                          isRetryable: result.error.isRetryable,
                          ok: false,
                        },
                },
                async () =>
                  streamText({
                    allowFallback: false,
                    maxOutputTokens: 1200,
                    messages: [
                      {
                        role: "user",
                        content: JSON.stringify(
                          {
                            question: parsedBody.data.message,
                            conversationMemory: memoryForModel(memory),
                            mcpToolResults: mcpContext.mcpToolResults,
                          },
                          null,
                          2,
                        ),
                      },
                    ],
                    onDelta: (delta) => {
                      assistantText += delta;
                      write({
                        type: "assistant_delta",
                        delta,
                      });
                    },
                    preferredProvider: "anthropic",
                    system: await prompt(),
                    temperature: 0,
                    use: "workspace-query",
                  }),
              );

              if (!streamResult.ok) {
                if (assistantText.trim().length > 0) {
                  await withLangfuseObservation(
                    {
                      name: "runtime.message.persist_partial",
                      metadata: {
                        caseId,
                        threadId: userMessageResult.thread.id,
                      },
                      output: (message) => ({
                        messageId: message.id,
                        outputLength: message.content.length,
                        status: message.status,
                      }),
                    },
                    async () =>
                      completeAssistantMessage({
                        content: assistantText,
                        contextTrace: mcpContext.contextTrace,
                        inputTokens: null,
                        messageId: assistantMessage.id,
                        model: null,
                        outputTokens: null,
                        provider: null,
                      }),
                  );
                } else {
                  await withLangfuseObservation(
                    {
                      name: "runtime.message.fail",
                      metadata: {
                        caseId,
                        errorCategory: streamResult.error.errorCategory,
                        threadId: userMessageResult.thread.id,
                      },
                      output: (message) => ({
                        messageId: message.id,
                        status: message.status,
                      }),
                    },
                    async () =>
                      failAssistantMessage({
                        error: {
                          errorCategory: streamResult.error.errorCategory,
                          message: streamResult.error.message,
                        },
                        messageId: assistantMessage.id,
                      }),
                  );
                }
                write({
                  type: "error",
                  message: streamResult.error.message,
                });
                close();
                return {
                  errorCategory: streamResult.error.errorCategory,
                  ok: false,
                  stage: "model",
                };
              }

              const completedMessage = await withLangfuseObservation(
                {
                  name: "runtime.message.persist",
                  metadata: {
                    caseId,
                    model: streamResult.model,
                    provider: streamResult.provider,
                    threadId: userMessageResult.thread.id,
                  },
                  output: (message) => ({
                    inputTokens: message.inputTokens,
                    messageId: message.id,
                    model: message.model,
                    outputLength: message.content.length,
                    outputTokens: message.outputTokens,
                    provider: message.provider,
                    status: message.status,
                  }),
                },
                async () =>
                  completeAssistantMessage({
                    content: streamResult.data || assistantText,
                    contextTrace: mcpContext.contextTrace,
                    inputTokens: streamResult.usage.inputTokens,
                    messageId: assistantMessage.id,
                    model: streamResult.model,
                    outputTokens: streamResult.usage.outputTokens,
                    provider: streamResult.provider,
                  }),
              );

              write({
                type: "assistant_done",
                message: completedMessage,
              });
              close();

              return {
                contextResultCount: mcpContext.mcpToolResults.length,
                model: streamResult.model,
                ok: true,
                outputLength: completedMessage.content.length,
                provider: streamResult.provider,
              };
            },
          );
        } catch (error) {
          if (assistantMessageId) {
            if (assistantText.trim().length > 0) {
              await completeAssistantMessage({
                content: assistantText,
                contextTrace: [],
                inputTokens: null,
                messageId: assistantMessageId,
                model: null,
                outputTokens: null,
                provider: null,
              }).catch(() => null);
            } else {
              await failAssistantMessage({
                error: {
                  errorCategory: "unknown",
                  message:
                    error instanceof Error ? error.message : "Case chat stream failed.",
                },
                messageId: assistantMessageId,
              }).catch(() => null);
            }
          }

          write({
            type: "error",
            message:
              error instanceof Error ? error.message : "Case chat stream failed.",
          });
          close();
        }
      },
    }),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/event-stream; charset=utf-8",
      },
    },
  );
}
