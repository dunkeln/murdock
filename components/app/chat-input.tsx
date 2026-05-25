"use client";

import { ArrowUp } from "lucide-react";
import * as React from "react";

import {
  askWorkspaceHarnessAction,
  type AskWorkspaceHarnessActionResult,
} from "@/app/(app)/case/workspace-query-actions";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatInputProps = {
  caseId: string;
  className?: string;
  contextLabel?: string;
  disabledReason?: string;
  operationalReady?: boolean;
  placeholder?: string;
};

function alertResult(result: AskWorkspaceHarnessActionResult) {
  if (result.ok) {
    window.alert(result.answer);
    return;
  }

  window.alert(result.message);
}

export function ChatInput({
  caseId,
  className,
  contextLabel = "Matter input",
  disabledReason = "Operational intelligence is still preparing.",
  operationalReady = true,
  placeholder = "Ask from the current harness context...",
}: ChatInputProps) {
  const [question, setQuestion] = React.useState("");
  const [isPending, startTransition] = React.useTransition();
  const canSubmit =
    Boolean(caseId) && operationalReady && question.trim().length > 0 && !isPending;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await askWorkspaceHarnessAction(formData);
      alertResult(result);
      if (result.ok) {
        setQuestion("");
      }
    });
  }

  return (
    <form
      aria-label={contextLabel}
      className={cn(
        "flex w-full max-w-2xl items-center gap-3 border border-paper/15 bg-ink px-3 py-2",
        className
      )}
      onSubmit={submit}
    >
      <input name="caseId" type="hidden" value={caseId} />
      <Textarea
        aria-label="Chat prompt"
        className="h-10 min-h-10 flex-1 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-0 py-2 text-sm text-paper placeholder:text-paper/35 focus-visible:border-transparent focus-visible:ring-0 md:text-sm [field-sizing:fixed]"
        disabled={isPending}
        name="question"
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={placeholder}
        value={question}
      />
      <Button
        aria-label={operationalReady ? "Send message" : "Operational intelligence preparing"}
        className="rounded-none bg-paper text-ink hover:bg-paper/90"
        disabled={!canSubmit}
        size="icon-sm"
        title={operationalReady ? "Send message" : disabledReason}
        type="submit"
      >
        <ArrowUp data-icon="inline-start" />
      </Button>
    </form>
  );
}
