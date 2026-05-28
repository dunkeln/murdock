"use client";

import { ArrowDown, ArrowUp, Copy } from "lucide-react";
import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  CaseChatMessageDto,
  CaseChatStreamEvent,
} from "@/lib/contracts/case-chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  sharedWorkspaceSurfaceWidthClass,
  WorkspaceSurface,
  type WorkspaceSurfaceMode,
} from "./workspace-surface";

type CaseChatSurfaceProps = {
  className?: string;
  chat: CaseChatController;
  mode?: CaseChatSurfaceMode;
};

export type CaseChatSurfaceMode = WorkspaceSurfaceMode;

type CaseChatComposerProps = {
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
  isStreaming: boolean;
  onSubmitMessage: (message: string) => void;
  placeholder?: string;
};

export type CaseChatController = {
  error: string | null;
  isStreaming: boolean;
  messages: CaseChatMessageDto[];
  submitMessage: (message: string) => Promise<void>;
};

const chatStageWidthByMode = {
  contained: "70%",
  content: "65%",
} satisfies Record<CaseChatSurfaceMode, `${number}%`>;

const chatStageStyleByMode = {
  contained: { width: chatStageWidthByMode.contained },
  content: { width: chatStageWidthByMode.content },
} satisfies Record<CaseChatSurfaceMode, CSSProperties>;

function temporaryAssistantMessage(caseId: string, content = ""): CaseChatMessageDto {
  const now = new Date().toISOString();

  return {
    id: "streaming-assistant",
    threadId: "streaming-thread",
    caseId,
    userId: "current-user",
    role: "assistant",
    status: "streaming",
    content,
    contextTrace: [],
    provider: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    createdAt: now,
    updatedAt: now,
  };
}

function appendAssistantDelta(
  messages: CaseChatMessageDto[],
  caseId: string,
  delta: string,
) {
  const existing = messages.find((message) => message.id === "streaming-assistant");

  if (!existing) {
    return [...messages, temporaryAssistantMessage(caseId, delta)];
  }

  return messages.map((message) =>
    message.id === "streaming-assistant"
      ? { ...message, content: `${message.content}${delta}` }
      : message,
  );
}

async function copyMessage(content: string) {
  await navigator.clipboard.writeText(content);
}

function parseSseChunk(buffer: string) {
  return buffer
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .join("\n");
}

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).join("");
  }

  if (React.isValidElement<{ children?: ReactNode }>(node)) {
    return textFromNode(node.props.children);
  }

  return "";
}

function emailDraftFromPre(children: ReactNode) {
  if (
    !React.isValidElement<{
      children?: ReactNode;
      className?: string;
    }>(children)
  ) {
    return null;
  }

  const className = children.props.className ?? "";

  if (!className.split(/\s+/).includes("language-email")) {
    return null;
  }

  return textFromNode(children.props.children).replace(/\n$/, "");
}

function EmailDraftBlock({ content }: { content: string }) {
  return (
    <div className="relative overflow-hidden border border-paper/20 bg-paper/[0.06] p-4 pr-12 text-paper">
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">
        {content}
      </pre>
      <Button
        aria-label="Copy email draft"
        className="hover-theme-invert absolute bottom-3 right-3 size-7 rounded-none border border-paper/15 bg-ink p-0 text-paper"
        onClick={() => copyMessage(content)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <Copy data-icon="inline-start" />
      </Button>
    </div>
  );
}

function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        a: ({ children, ...props }) => (
          <a
            {...props}
            className="underline decoration-paper/45 underline-offset-4 hover:decoration-paper"
            rel="noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => (
          <code className={cn("bg-paper/10 px-1 font-mono text-[0.92em]", className)}>
            {children}
          </code>
        ),
        h1: ({ children }) => (
          <h3 className="font-heading text-base uppercase leading-tight">
            {children}
          </h3>
        ),
        h2: ({ children }) => (
          <h3 className="font-heading text-base uppercase leading-tight">
            {children}
          </h3>
        ),
        h3: ({ children }) => (
          <h3 className="font-heading text-sm uppercase leading-tight">
            {children}
          </h3>
        ),
        li: ({ children }) => <li className="pl-0.5">{children}</li>,
        ol: ({ children }) => (
          <ol className="list-decimal space-y-1 pl-5">{children}</ol>
        ),
        p: ({ children }) => <p>{children}</p>,
        pre: ({ children }) => {
          const emailDraft = emailDraftFromPre(children);

          if (emailDraft !== null) {
            return <EmailDraftBlock content={emailDraft} />;
          }

          return (
            <pre className="overflow-x-auto bg-paper/10 p-2 font-mono text-xs">
              {children}
            </pre>
          );
        },
        ul: ({ children }) => (
          <ul className="list-disc space-y-1 pl-5">{children}</ul>
        ),
      }}
      remarkPlugins={[remarkGfm]}
    >
      {content}
    </ReactMarkdown>
  );
}

export function useCaseChatStream({
  caseId,
  initialMessages,
}: {
  caseId: string;
  initialMessages: CaseChatMessageDto[];
}): CaseChatController {
  const [messages, setMessages] =
    React.useState<CaseChatMessageDto[]>(initialMessages);
  const [error, setError] = React.useState<string | null>(null);
  const [isStreaming, setIsStreaming] = React.useState(false);

  const submitMessage = React.useCallback(async (rawMessage: string) => {
    const message = rawMessage.trim();

    if (!message || isStreaming) {
      return;
    }

    setError(null);
    setIsStreaming(true);

    try {
      const response = await fetch(`/api/cases/${caseId}/chat/stream`, {
        body: JSON.stringify({ message }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.body) {
        throw new Error("Chat stream did not start.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const data = parseSseChunk(frame);

          if (!data) {
            continue;
          }

          const event = JSON.parse(data) as CaseChatStreamEvent;

          if (event.type === "user_message_saved") {
            setMessages((current) => [...current, event.message]);
          } else if (event.type === "assistant_delta") {
            setMessages((current) =>
              appendAssistantDelta(current, caseId, event.delta),
            );
          } else if (event.type === "assistant_done") {
            setMessages((current) => [
              ...current.filter((item) => item.id !== "streaming-assistant"),
              event.message,
            ]);
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (streamError) {
      setError(
        streamError instanceof Error
          ? streamError.message
          : "Case chat failed.",
      );
    } finally {
      setIsStreaming(false);
    }
  }, [caseId, isStreaming]);

  return {
    error,
    isStreaming,
    messages,
    submitMessage,
  };
}

export function CaseChatComposer({
  className,
  disabled = false,
  disabledReason,
  isStreaming,
  onSubmitMessage,
  placeholder = "Ask from the current case context...",
}: CaseChatComposerProps) {
  const [draft, setDraft] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const canSubmit = draft.trim().length > 0 && !isStreaming && !disabled;

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = draft.trim();

    if (!message || isStreaming || disabled) {
      return;
    }

    setDraft("");
    onSubmitMessage(message);
  }

  function submitOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey) {
      return;
    }

    event.preventDefault();

    const message = draft.trim();

    if (!message || isStreaming || disabled) {
      return;
    }

    setDraft("");
    onSubmitMessage(message);
  }

  return (
    <form
      aria-label="Case chat input"
      className={cn(
        "flex shrink-0 items-end gap-3 border border-paper/15 bg-ink px-3 py-2",
        className,
      )}
      onSubmit={submit}
    >
      <Textarea
        aria-label="Message"
        className="max-h-40 min-h-10 flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-2 text-sm leading-5 text-paper placeholder:text-paper/35 focus-visible:border-transparent focus-visible:ring-0 md:text-sm [field-sizing:fixed]"
        disabled={isStreaming || disabled}
        name="message"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={submitOnEnter}
        placeholder={placeholder}
        ref={textareaRef}
        rows={1}
        value={draft}
      />
      <Button
        aria-label={disabled ? "Case context preparing" : "Send message"}
        className="rounded-none bg-paper text-ink hover:bg-paper/90"
        disabled={!canSubmit}
        size="icon-sm"
        title={disabled ? disabledReason : "Send message"}
        type="submit"
      >
        <ArrowUp data-icon="inline-start" />
      </Button>
    </form>
  );
}

export function CaseChatSurface({
  chat,
  className,
  mode = "contained",
}: CaseChatSurfaceProps) {
  const bottomRef = React.useRef<HTMLLIElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = React.useState(false);

  const updateJumpState = React.useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    setShowJumpToLatest(distanceFromBottom > 96);
  }, []);

  const scrollToLatest = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current;

    if (!element) {
      bottomRef.current?.scrollIntoView({ block: "end", behavior });
      return;
    }

    element.scrollTo({
      behavior,
      top: element.scrollHeight,
    });
    setShowJumpToLatest(false);
  }, []);

  React.useEffect(() => {
    if (!showJumpToLatest) {
      scrollToLatest("auto");
    }
  }, [chat.messages.length, scrollToLatest, showJumpToLatest]);

  return (
    <WorkspaceSurface
      className={cn(
        "relative flex-1 xl:self-center",
        sharedWorkspaceSurfaceWidthClass,
        className,
      )}
      mode={mode}
    >
      <div
        className="min-h-0 w-full flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateJumpState}
        ref={scrollRef}
      >
        <div
          aria-label="Case chat"
          className="mx-auto max-w-full"
          data-case-chat-surface
          data-chat-stage
          style={chatStageStyleByMode[mode]}
        >
          <ol className="flex flex-col gap-4 px-1 py-2">
            {chat.messages.map((message) => (
              <li
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
                key={message.id}
              >
                <article
                  className={cn(
                    "flex flex-col text-sm leading-6",
                    message.role === "user"
                      ? "max-w-[80%] border border-paper bg-paper px-3 py-2 text-ink"
                      : "max-w-[70%] text-paper",
                  )}
                >
                  {message.role === "assistant" ? (
                    <div className="space-y-3 text-sm leading-6 text-paper">
                      <ChatMarkdown content={message.content} />
                    </div>
                  ) : (
                    <p>{message.content}</p>
                  )}
                  {message.role === "assistant" && message.content ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          aria-label="Copy response"
                          className="hover-theme-invert mt-1.5 size-6 min-w-0 rounded-none border-0 bg-ink p-0 text-paper"
                          onClick={() => copyMessage(message.content)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Copy data-icon="inline-start" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Copy response</TooltipContent>
                    </Tooltip>
                  ) : null}
                </article>
              </li>
            ))}
            <li aria-hidden ref={bottomRef} />
          </ol>
        </div>
      </div>

      {showJumpToLatest ? (
        <Button
          aria-label="Jump to latest message"
          className="hover-theme-invert absolute bottom-3 right-2 z-10 size-8 rounded-none border border-paper/20 bg-ink p-0 text-paper shadow-none"
          onClick={() => scrollToLatest()}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowDown data-icon="inline-start" />
        </Button>
      ) : null}

      {chat.error ? (
        <p className="shrink-0 py-2 text-sm text-paper/65">{chat.error}</p>
      ) : null}
    </WorkspaceSurface>
  );
}
