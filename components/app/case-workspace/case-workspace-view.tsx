"use client";

import * as React from "react";

import { useIngestedFiles } from "@/components/app/ingested-files-context";
import type { PdfPageMarker } from "@/components/app/pdf-viewer";
import { buildCaseControlDto } from "@/lib/case-control";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import { cn } from "@/lib/utils";

import { CaseControlPanel } from "./components/case-control-panel";
import { CaseDocumentSwitcher } from "./components/case-document-switcher";
import { CaseSourceSurface } from "./components/case-source-surface";
import { WorkspaceInputFooter } from "./components/workspace-input-footer";

type CaseWorkspaceViewProps = {
  workspace: CaseWorkspaceDto;
};

export function CaseWorkspaceView({ workspace }: CaseWorkspaceViewProps) {
  const intake = useIngestedFiles();
  const control = buildCaseControlDto(workspace);
  const firstItemId = control.queue[0]?.id ?? null;
  const [activeItemId, setActiveItemId] = React.useState<string | null>(
    firstItemId,
  );
  const sourceDocuments = workspace.sourceDocuments;
  const [selectedDocumentId, setSelectedDocumentId] = React.useState<string | null>(
    sourceDocuments[0]?.id ?? null,
  );
  const selectedDocument =
    sourceDocuments.find((document) => document.id === selectedDocumentId) ?? null;
  const hasFiles = intake.files.length > 0 || sourceDocuments.length > 0;
  const selectedFile = intake.selectedFile;
  const selectedSourceName = selectedFile?.name ?? selectedDocument?.fileName ?? null;
  const selectedSourceUrl = !selectedFile && selectedDocument?.caseDocumentId
    ? `/case-documents/${selectedDocument.caseDocumentId}`
    : null;
  const checkedFiles = intake.files.filter((file) =>
    intake.checkedFileIds.includes(file.id),
  );
  const hasSourceFailure = checkedFiles.some(
    (file) =>
      file.ocrStatus === "failed" ||
      file.shapingStatus === "failed",
  );
  const showSourceSurface = Boolean(selectedFile || selectedDocument);
  const showControlPanel = Boolean(
    hasSourceFailure || (showSourceSurface && control.activeItem),
  );
  const showWorkspaceSurface = showControlPanel || showSourceSurface;
  const activeQueueItemId = control.queue.some((item) => item.id === activeItemId)
    ? activeItemId
    : null;
  const effectiveActiveItemId = activeQueueItemId ?? firstItemId;
  const reviewMarkers = React.useMemo<PdfPageMarker[]>(
    () =>
      control.queue.flatMap((item, index) => {
        const sourceRef =
          item.sourceRefs.find(
            (source) =>
              source.pageIndex !== null &&
              (!selectedSourceName || source.fileName === selectedSourceName),
          ) ?? null;

        if (!sourceRef || sourceRef.pageIndex === null) {
          return [];
        }

        return [
          {
            id: item.id,
            label: String(index + 1),
            pageIndex: sourceRef.pageIndex,
            priority: item.priority,
            title: item.title,
          },
        ];
      }),
    [control.queue, selectedSourceName],
  );
  const layoutClass =
    showControlPanel && showSourceSurface
      ? "items-stretch xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,clamp(34rem,70%,84rem))_minmax(15rem,19rem)] xl:justify-between xl:gap-3 xl:overflow-hidden"
      : "items-start";
  const overflowClass =
    hasFiles && showControlPanel && showSourceSurface
      ? "xl:overflow-hidden"
      : "";
  const sourceOrderClass = showControlPanel ? "xl:order-1" : "";
  const controlOrderClass = showSourceSurface ? "xl:order-2" : "";

  return (
    <div
      aria-label={workspace.case.title}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-case-workspace
      data-has-files={hasFiles}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 basis-0 flex-col gap-5 overflow-y-auto pb-5",
          overflowClass,
        )}
      >
        <div className="flex w-full min-h-0 min-w-0 flex-1 flex-col gap-4">
          <header className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="truncate font-heading text-3xl uppercase leading-none text-paper md:text-4xl">
                {control.case.title}
              </h1>
            </div>
            <CaseDocumentSwitcher
              documents={sourceDocuments}
              onSelectedDocumentChange={(documentId) => {
                intake.onSelectFile(null);
                setSelectedDocumentId(documentId);
              }}
              selectedDocumentId={selectedDocumentId}
            />
          </header>

          {showWorkspaceSurface ? (
            <div
              className={cn("grid w-full min-w-0 gap-5", layoutClass)}
              data-case-layout
            >
              {showControlPanel ? (
                <CaseControlPanel
                  activeItemId={effectiveActiveItemId}
                  className={cn(
                    "order-1",
                    controlOrderClass,
                    !showSourceSurface &&
                      "h-[calc(100vh-18rem)] min-h-[24rem] max-w-2xl",
                  )}
                  control={control}
                  onActiveItemChange={setActiveItemId}
                />
              ) : null}
              {showSourceSurface ? (
                <CaseSourceSurface
                  className={cn(
                    "order-2 min-h-[28rem] xl:h-full xl:min-h-0",
                    !showControlPanel && "xl:w-[min(70%,84rem)]",
                    sourceOrderClass,
                  )}
                  activeMarkerId={effectiveActiveItemId}
                  documentName={selectedSourceName ?? undefined}
                  markers={reviewMarkers}
                  onMarkerSelect={setActiveItemId}
                  selectedFile={selectedFile}
                  sourceUrl={selectedSourceUrl}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <WorkspaceInputFooter
        caseId={workspace.case.id}
        contextLabel="Case context input"
        initialOperationalReady={control.footerEnabled}
        placeholder="Ask from the current case context..."
      />
    </div>
  );
}
