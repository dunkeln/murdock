"use client";

import { useIngestedFiles } from "@/components/app/ingested-files-context";
import { PdfViewer } from "@/components/app/pdf-viewer";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import { buildHarnessReflection } from "@/lib/harness-reflection";

import { WorkspaceInputFooter } from "./components/workspace-input-footer";

type CaseWorkspaceViewProps = {
  workspace: CaseWorkspaceDto;
};

export function CaseWorkspaceView({ workspace }: CaseWorkspaceViewProps) {
  const { selectedFile } = useIngestedFiles();
  const initialOperationalReady = buildHarnessReflection(workspace).isLive;

  return (
    <div
      aria-label={workspace.case.title}
      className="flex h-full min-h-0 min-w-0 flex-col"
      data-case-workspace
    >
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <PdfViewer file={selectedFile} />
      </div>

      <WorkspaceInputFooter
        caseId={workspace.case.id}
        initialOperationalReady={initialOperationalReady}
      />
    </div>
  );
}
