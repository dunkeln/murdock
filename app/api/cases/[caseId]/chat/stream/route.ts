import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import type { CaseChatStreamEvent } from "@/lib/contracts/case-chat";
import {
  completeAssistantMessage,
  createCurrentUserCaseChatUserMessage,
  createStreamingAssistantMessage,
  failAssistantMessage,
  prepareCaseChatMemory,
} from "@/lib/server/case-chat/service";
import { prepareWorkspaceMcpContext } from "@/lib/server/case-workspace/query";
import { streamText } from "@/lib/server/ai/stream-text";

export const runtime = "nodejs";

const promptPath = join(process.cwd(), "prompts", "case-chat-answer-v1.md");

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

          const memory = await prepareCaseChatMemory({
            thread: userMessageResult.thread,
          });
          const mcpContext = await prepareWorkspaceMcpContext({
            caseId,
            question: parsedBody.data.message,
            subscriber: (event) => {
              write({
                type: "context_trace",
                event,
              });
            },
          });

          if (!mcpContext.ok) {
            write({
              type: "error",
              message: mcpContext.message,
            });
            close();
            return;
          }

          const assistantMessage = await createStreamingAssistantMessage({
            caseId,
            threadId: userMessageResult.thread.id,
            userId: userMessageResult.user.id,
          });
          assistantMessageId = assistantMessage.id;

          const streamResult = await streamText({
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
          });

          if (!streamResult.ok) {
            if (assistantText.trim().length > 0) {
              await completeAssistantMessage({
                content: assistantText,
                contextTrace: mcpContext.contextTrace,
                inputTokens: null,
                messageId: assistantMessage.id,
                model: null,
                outputTokens: null,
                provider: null,
              });
            } else {
              await failAssistantMessage({
                error: {
                  errorCategory: streamResult.error.errorCategory,
                  message: streamResult.error.message,
                },
                messageId: assistantMessage.id,
              });
            }
            write({
              type: "error",
              message: streamResult.error.message,
            });
            close();
            return;
          }

          const completedMessage = await completeAssistantMessage({
            content: streamResult.data || assistantText,
            contextTrace: mcpContext.contextTrace,
            inputTokens: streamResult.usage.inputTokens,
            messageId: assistantMessage.id,
            model: streamResult.model,
            outputTokens: streamResult.usage.outputTokens,
            provider: streamResult.provider,
          });

          write({
            type: "assistant_done",
            message: completedMessage,
          });
          close();
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
