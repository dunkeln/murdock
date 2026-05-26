"use client";

import * as React from "react";

import { useIngestedFiles } from "@/components/app/ingested-files-context";
import {
  buildCaseControlDto,
  filterCaseControlBySourceGrounding,
  type CaseControlDto,
} from "@/lib/case-control";
import type { CaseChatMessageDto } from "@/lib/contracts/case-chat";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import { cn } from "@/lib/utils";

import {
  CaseChatComposer,
  CaseChatSurface,
  useCaseChatStream,
} from "./components/case-chat-surface";
import { CaseControlPanel } from "./components/case-control-panel";
import {
  CaseDocumentSwitcher,
  type CaseDocumentSwitcherItem,
} from "./components/case-document-switcher";
import {
  CaseFileReviewSurface,
  type CaseFileReviewSurfaceMode,
} from "./components/case-file-review-surface";
import { WorkspaceInputFooter } from "./components/workspace-input-footer";
import { sharedWorkspaceSurfaceWidthClass } from "./components/workspace-surface";

type CaseWorkspaceViewProps = {
  initialChatMessages?: CaseChatMessageDto[];
  documentRevisions?: DocumentRevisionSummaryDto[];
  initialPreviewedSourceKey?: string;
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
    cn(
      "order-2 min-h-[28rem] xl:order-1 xl:h-full xl:min-h-0 xl:justify-self-center",
      sharedWorkspaceSurfaceWidthClass,
    ),
  "source-only": cn("order-2", sharedWorkspaceSurfaceWidthClass),
  "control-only": "order-2 min-h-[28rem] xl:h-full xl:min-h-0",
} satisfies Record<WorkspaceLayoutMode, string>;

const sourceSurfaceModeByWorkspaceMode = {
  "source-and-control": "contained",
  "source-only": "content",
  "control-only": "contained",
} satisfies Record<WorkspaceLayoutMode, CaseFileReviewSurfaceMode>;

const documentSwitcherWidthClass =
  "w-fit max-w-full shrink-0";

const workspaceHeaderClass =
  "flex shrink-0 items-start justify-between gap-6";

function activeReviewItemIdFor(
  control: CaseControlDto,
  activeReviewItemId: string | null,
) {
  if (control.queue.some((item) => item.id === activeReviewItemId)) {
    return activeReviewItemId;
  }

  if (activeReviewItemId === null) {
    return null;
  }

  return control.queue[0]?.id ?? null;
}

function previewedDocumentIdForSourceKey(
  workspace: CaseWorkspaceDto,
  sourceKey: string | undefined,
) {
  if (!sourceKey) {
    return null;
  }

  return (
    workspace.sourceDocuments.find((document) => document.sourceKey === sourceKey)
      ?.id ?? null
  );
}

function replacePreviewedSourceParam(sourceKey: string | null) {
  const url = new URL(window.location.href);

  if (sourceKey) {
    url.searchParams.set("source", sourceKey);
  } else {
    url.searchParams.delete("source");
  }

  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function CaseWorkspaceView({
  initialChatMessages = [],
  documentRevisions = [],
  initialPreviewedSourceKey,
  workspace,
}: CaseWorkspaceViewProps) {
  const intake = useIngestedFiles();
  const fileReviewSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const control = buildCaseControlDto(workspace);
  const firstItemId = control.queue[0]?.id ?? null;
  const [activeReviewItemId, setActiveReviewItemId] = React.useState<string | null>(
    firstItemId,
  );
  const sourceDocuments = workspace.sourceDocuments;
  const [previewedDocumentId, setPreviewedDocumentId] = React.useState<string | null>(
    previewedDocumentIdForSourceKey(workspace, initialPreviewedSourceKey),
  );
  const previewedDocument =
    sourceDocuments.find((document) => document.id === previewedDocumentId) ?? null;
  const resolvedPreviewedDocumentId = previewedDocument?.id ?? null;
  const hasFiles = intake.files.length > 0 || sourceDocuments.length > 0;
  const previewedFile = intake.previewedFile;
  const previewedSourceName = previewedFile?.name ?? previewedDocument?.fileName ?? null;
  const previewedSourceUrl = !previewedFile && previewedDocument?.caseDocumentId
    ? `/case-documents/${previewedDocument.caseDocumentId}`
    : null;
  const chat = useCaseChatStream({
    caseId: workspace.case.id,
    initialMessages: initialChatMessages,
  });
  const clearPreviewedSource = React.useCallback(() => {
    setPreviewedDocumentId(null);
    intake.onPreviewFile(null);
    replacePreviewedSourceParam(null);
  }, [intake]);
  const groundedControl = React.useMemo(
    () =>
      filterCaseControlBySourceGrounding(control, {
        docId: previewedDocument?.id ?? null,
        fileName: previewedSourceName,
      }),
    [
      control,
      previewedDocument?.id,
      previewedSourceName,
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
        const isPreviewed = resolvedPreviewedDocumentId === document.id;

        return {
          id: `persisted:${document.id}`,
          isPreviewed,
          label: document.fileName,
          onPreviewChange: (previewed: boolean) => {
            if (previewed) {
              intake.onPreviewFile(null);
              setPreviewedDocumentId(document.id);
              replacePreviewedSourceParam(document.sourceKey);
              return;
            }

            setPreviewedDocumentId(null);
            replacePreviewedSourceParam(null);
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
              replacePreviewedSourceParam(null);
            },
            variant: "transient" as const,
          };
        }),
    ],
    [
      intake,
      persistedCaseDocumentIds,
      resolvedPreviewedDocumentId,
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
  const showFilePreviewSurface = documentSwitcherItems.length > 0 && showSourceSurface;
  const showStandaloneControlPanel = showControlPanel && documentSwitcherItems.length === 0;
  const previewedDocumentRevisions = React.useMemo(
    () =>
      documentRevisions.filter((revision) => {
        if (!previewedDocument) {
          return false;
        }

        return (
          revision.toSourceDocumentId === previewedDocument.id ||
          revision.fromSourceDocumentId === previewedDocument.id
        );
      }),
    [documentRevisions, previewedDocument],
  );
  const showWorkspaceSurface = showStandaloneControlPanel || showFilePreviewSurface;
  const effectiveActiveReviewItemId = activeReviewItemIdFor(
    control,
    activeReviewItemId,
  );
  const effectiveGroundedReviewItemId = activeReviewItemIdFor(
    groundedControl,
    activeReviewItemId,
  );
  const workspaceLayoutMode: WorkspaceLayoutMode =
    showControlPanel && showFilePreviewSurface
      ? "source-and-control"
      : showStandaloneControlPanel
        ? "control-only"
        : "source-only";
  React.useEffect(() => {
    if (!showFilePreviewSurface) {
      return;
    }

    function dismissPreviewOnOutsidePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (fileReviewSurfaceRef.current?.contains(target)) {
        return;
      }

      if (
        target instanceof Element &&
        target.closest("[data-case-document-switcher]")
      ) {
        return;
      }

      clearPreviewedSource();
    }

    document.addEventListener(
      "pointerdown",
      dismissPreviewOnOutsidePointerDown,
      { capture: true },
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        dismissPreviewOnOutsidePointerDown,
        { capture: true },
      );
    };
  }, [clearPreviewedSource, showFilePreviewSurface]);

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
            <div className="min-w-0 flex-1">
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
              {showStandaloneControlPanel ? (
                <CaseControlPanel
                  activeReviewItemId={effectiveActiveReviewItemId}
                  className={controlPanelClassByMode[workspaceLayoutMode]}
                  control={control}
                  onActiveReviewItemChange={setActiveReviewItemId}
                />
              ) : null}
              {showFilePreviewSurface ? (
                <div
                  className={sourceSurfaceClassByMode[workspaceLayoutMode]}
                  ref={fileReviewSurfaceRef}
                >
                  <CaseFileReviewSurface
                    activeReviewItemId={effectiveGroundedReviewItemId}
                    control={groundedControl}
                    documentName={previewedSourceName ?? undefined}
                    mode={sourceSurfaceModeByWorkspaceMode[workspaceLayoutMode]}
                    onActiveReviewItemChange={setActiveReviewItemId}
                    previewedFile={previewedFile}
                    revisions={previewedDocumentRevisions}
                    sourceUrl={previewedSourceUrl}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <CaseChatSurface
              chat={chat}
              className="min-h-0 flex-1"
            />
          )}
        </div>
      </div>
      <WorkspaceInputFooter initialOperationalReady={control.footerEnabled}>
        {({ disabledReason, operationalReady }) => (
          <CaseChatComposer
            className="mx-auto w-full max-w-2xl"
            disabled={!operationalReady}
            disabledReason={disabledReason}
            isStreaming={chat.isStreaming}
            onSubmitMessage={(message) => {
              clearPreviewedSource();
              void chat.submitMessage(message);
            }}
          />
        )}
      </WorkspaceInputFooter>
    </div>
  );
}
