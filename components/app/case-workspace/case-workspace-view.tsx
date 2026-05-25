"use client";

import * as React from "react";

import { useIngestedFiles } from "@/components/app/ingested-files-context";
import {
  buildCaseControlDto,
  filterCaseControlBySourceGrounding,
  type CaseControlDto,
} from "@/lib/case-control";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import { cn } from "@/lib/utils";

import { CaseControlPanel } from "./components/case-control-panel";
import {
  CaseDocumentSwitcher,
  type CaseDocumentSwitcherItem,
} from "./components/case-document-switcher";
import {
  CaseSourceSurface,
  type CaseSourceSurfaceMode,
} from "./components/case-source-surface";
import { WorkspaceInputFooter } from "./components/workspace-input-footer";

type CaseWorkspaceViewProps = {
  workspace: CaseWorkspaceDto;
};

type WorkspaceLayoutMode = "source-and-control" | "source-only" | "control-only";

const workspaceLayoutClassByMode = {
  "source-and-control":
    "items-stretch xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)] xl:overflow-hidden",
  "source-only": "items-start",
  "control-only": "items-start",
} satisfies Record<WorkspaceLayoutMode, string>;

const workspaceOverflowClassByMode = {
  "source-and-control": "xl:overflow-hidden",
  "source-only": "",
  "control-only": "",
} satisfies Record<WorkspaceLayoutMode, string>;

const controlPanelClassByMode = {
  "source-and-control": "order-1 xl:order-2",
  "source-only": "order-1",
  "control-only": "order-1 h-[calc(100vh-18rem)] min-h-[24rem] max-w-2xl",
} satisfies Record<WorkspaceLayoutMode, string>;

const sourceSurfaceClassByMode = {
  "source-and-control":
    "order-2 min-h-[28rem] xl:order-1 xl:h-full xl:min-h-0 xl:w-[min(90%,84rem)] xl:max-w-full xl:justify-self-center",
  "source-only": "order-2 w-full max-w-6xl",
  "control-only": "order-2 min-h-[28rem] xl:h-full xl:min-h-0",
} satisfies Record<WorkspaceLayoutMode, string>;

const sourceSurfaceModeByWorkspaceMode = {
  "source-and-control": "contained",
  "source-only": "content",
  "control-only": "contained",
} satisfies Record<WorkspaceLayoutMode, CaseSourceSurfaceMode>;

const documentSwitcherWidthClass =
  "md:w-[20rem] xl:w-[24rem] 2xl:w-[26rem]";

const workspaceHeaderClass =
  "grid shrink-0 gap-3 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]";

function activeReviewItemIdFor(
  control: CaseControlDto,
  activeReviewItemId: string | null,
) {
  if (control.queue.some((item) => item.id === activeReviewItemId)) {
    return activeReviewItemId;
  }

  return control.queue[0]?.id ?? null;
}

export function CaseWorkspaceView({ workspace }: CaseWorkspaceViewProps) {
  const intake = useIngestedFiles();
  const control = buildCaseControlDto(workspace);
  const firstItemId = control.queue[0]?.id ?? null;
  const [activeReviewItemId, setActiveReviewItemId] = React.useState<string | null>(
    firstItemId,
  );
  const [visiblePageIndex, setVisiblePageIndex] = React.useState<number | null>(0);
  const sourceDocuments = workspace.sourceDocuments;
  const [previewedDocumentId, setPreviewedDocumentId] = React.useState<string | null>(
    sourceDocuments[0]?.id ?? null,
  );
  const previewedDocument =
    sourceDocuments.find((document) => document.id === previewedDocumentId) ?? null;
  const hasFiles = intake.files.length > 0 || sourceDocuments.length > 0;
  const previewedFile = intake.previewedFile;
  const previewedSourceName = previewedFile?.name ?? previewedDocument?.fileName ?? null;
  const previewedSourceUrl = !previewedFile && previewedDocument?.caseDocumentId
    ? `/case-documents/${previewedDocument.caseDocumentId}`
    : null;
  const visiblePageSpanIds = React.useMemo(
    () =>
      new Set(
        workspace.sourceSpans
          .filter(
            (span) =>
              previewedDocument &&
              span.sourceDocumentId === previewedDocument.id &&
              span.pageIndex === visiblePageIndex,
          )
          .map((span) => span.id),
      ),
    [previewedDocument, visiblePageIndex, workspace.sourceSpans],
  );
  const groundedControl = React.useMemo(
    () =>
      filterCaseControlBySourceGrounding(control, {
        docId: previewedDocument?.id ?? null,
        fileName: previewedSourceName,
        pageIndex: visiblePageIndex,
        spanIds: visiblePageSpanIds,
      }),
    [
      control,
      previewedDocument?.id,
      previewedSourceName,
      visiblePageIndex,
      visiblePageSpanIds,
    ],
  );
  const includedFiles = intake.files.filter((file) =>
    intake.includedFileIds.includes(file.id),
  );
  const persistedCaseDocumentIds = React.useMemo(
    () =>
      new Set(
        sourceDocuments.flatMap((document) =>
          document.caseDocumentId ? [document.caseDocumentId] : [],
        ),
      ),
    [sourceDocuments],
  );
  const documentSwitcherItems = React.useMemo<CaseDocumentSwitcherItem[]>(
    () => [
      ...sourceDocuments.map((document) => {
        const isPreviewed = previewedDocumentId === document.id;

        return {
          id: `persisted:${document.id}`,
          isPreviewed,
          label: document.fileName,
          onPreviewChange: () => {
            intake.onPreviewFile(null);
            setPreviewedDocumentId(document.id);
            setVisiblePageIndex(0);
          },
          variant: "persisted" as const,
        };
      }),
      ...intake.files
        .filter(
          (item) =>
            !item.caseDocumentId || !persistedCaseDocumentIds.has(item.caseDocumentId),
        )
        .map((item) => {
          const isIncluded = intake.includedFileIds.includes(item.id);

          return {
            id: `transient:${item.id}`,
            isIncluded,
            isPreviewed: intake.previewedFileId === item.id,
            label: item.fileName,
            onDelete: () => intake.onDeleteFile(item.id),
            onIncludeChange: (included: boolean) => {
              intake.onIncludedFileIdsChange(
                included
                  ? Array.from(new Set([...intake.includedFileIds, item.id]))
                  : intake.includedFileIds.filter((id) => id !== item.id),
              );
            },
            onPreviewChange: (previewed: boolean) => {
              setPreviewedDocumentId(null);
              intake.onPreviewFile(previewed ? item.id : null);
              setVisiblePageIndex(0);
            },
            variant: "transient" as const,
          };
        }),
    ],
    [
      intake,
      persistedCaseDocumentIds,
      previewedDocumentId,
      sourceDocuments,
    ],
  );
  const hasSourceFailure = includedFiles.some(
    (file) =>
      file.ocrStatus === "failed" ||
      file.shapingStatus === "failed",
  );
  const showSourceSurface = Boolean(previewedFile || previewedDocument);
  const showControlPanel = Boolean(
    hasSourceFailure || control.activeItem,
  );
  const showGroundedControlOverlay = Boolean(
    showSourceSurface && groundedControl.queue.length > 0,
  );
  const showWorkspaceSurface = showControlPanel || showSourceSurface;
  const effectiveActiveReviewItemId = activeReviewItemIdFor(
    control,
    activeReviewItemId,
  );
  const effectiveGroundedReviewItemId = activeReviewItemIdFor(
    groundedControl,
    activeReviewItemId,
  );
  const workspaceLayoutMode: WorkspaceLayoutMode =
    showControlPanel && showSourceSurface
      ? "source-and-control"
      : showControlPanel
        ? "control-only"
        : "source-only";

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
          hasFiles && workspaceOverflowClassByMode[workspaceLayoutMode],
        )}
      >
        <div className="flex w-full min-h-0 min-w-0 flex-1 flex-col gap-4">
          <header className={workspaceHeaderClass}>
            <div className="min-w-0">
              <h1 className="truncate font-heading text-3xl uppercase leading-none text-paper md:text-4xl">
                {control.case.title}
              </h1>
            </div>
            <CaseDocumentSwitcher
              className={documentSwitcherWidthClass}
              items={documentSwitcherItems}
            />
          </header>

          {showWorkspaceSurface ? (
            <div
              className={cn(
                "grid w-full min-w-0 gap-5",
                workspaceLayoutClassByMode[workspaceLayoutMode],
              )}
              data-case-layout
            >
              {showControlPanel && !showSourceSurface ? (
                <CaseControlPanel
                  activeReviewItemId={effectiveActiveReviewItemId}
                  className={controlPanelClassByMode[workspaceLayoutMode]}
                  control={control}
                  onActiveReviewItemChange={setActiveReviewItemId}
                />
              ) : null}
              {showSourceSurface ? (
                <CaseSourceSurface
                  className={sourceSurfaceClassByMode[workspaceLayoutMode]}
                  documentName={previewedSourceName ?? undefined}
                  mode={sourceSurfaceModeByWorkspaceMode[workspaceLayoutMode]}
                  onVisiblePageIndexChange={setVisiblePageIndex}
                  overlay={
                    showGroundedControlOverlay ? (
                      <CaseControlPanel
                        activeReviewItemId={effectiveGroundedReviewItemId}
                        control={groundedControl}
                        onActiveReviewItemChange={setActiveReviewItemId}
                        variant="overlay"
                      />
                    ) : null
                  }
                  previewedFile={previewedFile}
                  sourceUrl={previewedSourceUrl}
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
