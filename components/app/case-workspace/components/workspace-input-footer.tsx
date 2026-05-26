"use client";

import * as React from "react";

import { useIngestedFiles } from "@/components/app/ingested-files-context";
import { cn } from "@/lib/utils";

type WorkspaceInputFooterProps = {
  children: (state: {
    disabledReason: string;
    operationalReady: boolean;
  }) => React.ReactNode;
  className?: string;
  initialOperationalReady: boolean;
};

function isHarnessReady(status: string | undefined) {
  return status === "ready" || status === "needs_review";
}

export function WorkspaceInputFooter({
  children,
  className,
  initialOperationalReady,
}: WorkspaceInputFooterProps) {
  const intake = useIngestedFiles();
  const includedFiles = intake.files.filter((file) =>
    intake.includedFileIds.includes(file.id),
  );
  const operationalReady =
    includedFiles.length > 0
      ? includedFiles.every((file) => isHarnessReady(file.shapingStatus))
      : initialOperationalReady;

  return (
    <footer
      className={cn(
        "flex h-20 shrink-0 items-center justify-center border-t border-paper/10 bg-ink/95 px-1",
        className,
      )}
      data-operational-ready={operationalReady}
    >
      {children({
        disabledReason: "Case context is not ready.",
        operationalReady,
      })}
    </footer>
  );
}
