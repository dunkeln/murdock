"use client";

import { ChatInput } from "@/components/app/chat-input";
import { useIngestedFiles } from "@/components/app/ingested-files-context";
import { cn } from "@/lib/utils";

type WorkspaceInputFooterProps = {
  caseId: string;
  className?: string;
  contextLabel?: string;
  initialOperationalReady: boolean;
  placeholder?: string;
};

function isHarnessReady(status: string | undefined) {
  return status === "ready" || status === "needs_review";
}

export function WorkspaceInputFooter({
  caseId,
  className,
  contextLabel = "Matter input",
  initialOperationalReady,
  placeholder,
}: WorkspaceInputFooterProps) {
  const intake = useIngestedFiles();
  const includedFiles = intake.files.filter((file) =>
    intake.includedFileIds.includes(file.id)
  );
  const operationalReady =
    includedFiles.length > 0
      ? includedFiles.every((file) => isHarnessReady(file.shapingStatus))
      : initialOperationalReady;

  return (
    <footer
      className={cn(
        "flex h-20 shrink-0 items-center justify-center border-t border-paper/10 bg-ink/95 px-1",
        className
      )}
      data-operational-ready={operationalReady}
    >
      <ChatInput
        caseId={caseId}
        className="mx-auto"
        contextLabel={contextLabel}
        disabledReason="Case context is not ready."
        operationalReady={operationalReady}
        placeholder={placeholder}
      />
    </footer>
  );
}
