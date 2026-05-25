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
  const checkedFiles = intake.files.filter((file) =>
    intake.checkedFileIds.includes(file.id)
  );
  const operationalReady =
    checkedFiles.length > 0
      ? checkedFiles.every((file) => isHarnessReady(file.shapingStatus))
      : initialOperationalReady;

  return (
    <footer
      className={cn(
        "shrink-0 border-t border-paper/10 bg-ink/95 px-1 pb-1 pt-4",
        className
      )}
      data-operational-ready={operationalReady}
    >
      <ChatInput
        caseId={caseId}
        className="mx-auto"
        contextLabel={contextLabel}
        disabledReason="Operational intelligence is still preparing for the checked documents."
        operationalReady={operationalReady}
        placeholder={placeholder}
      />
    </footer>
  );
}
