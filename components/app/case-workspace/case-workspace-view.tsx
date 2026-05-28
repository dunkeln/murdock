"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { useIngestedFiles } from "@/components/app/ingested-files-context";
import { Button } from "@/components/ui/button";
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
import { CaseChronologySurface } from "./components/case-chronology-surface";
import { CaseControlPanel } from "./components/case-control-panel";
import {
  CaseDocumentSwitcher,
  type CaseDocumentSwitcherItem,
} from "./components/case-document-switcher";
import {
  CaseFileReviewSurface,
  type CaseFileReviewSurfaceMode,
} from "./components/case-file-review-surface";
import {
  ReviewActionContent,
  ReviewActionTrigger,
  subscribeCaseActionQueueSync,
} from "./components/review-action-pipeline";
import { WorkspaceInputFooter } from "./components/workspace-input-footer";
import {
  sharedWorkspaceSurfaceWidthClass,
  WorkspaceSurface,
} from "./components/workspace-surface";

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
  "flex shrink-0 min-w-0 flex-col gap-2";
const workspaceHeaderTopRowClass =
  "flex min-w-0 items-start justify-between gap-6";

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
  const control = buildCaseControlDto(workspace);
  const firstItemId = control.queue[0]?.id ?? null;
  const [activeReviewItemId, setActiveReviewItemId] = React.useState<string | null>(
    firstItemId,
  );
  const [showChronology, setShowChronology] = React.useState(false);
  const [showActionItems, setShowActionItems] = React.useState(false);
  const [actionTaskCount, setActionTaskCount] = React.useState(0);
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
              setShowActionItems(false);
              setShowChronology(false);
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
              if (previewed) {
                setShowActionItems(false);
                setShowChronology(false);
              }
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
  const hasActionItems = control.queue.length > 0 || actionTaskCount > 0;
  const hasChronology = workspace.chronologyEvents.length > 0;
  const showActionItemsSurface = showActionItems && hasActionItems;
  const showChronologySurface = showChronology && hasChronology;
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
    let cancelled = false;

    async function refreshActionTaskCount() {
      try {
        const response = await fetch(
          `/api/cases/${workspace.case.id}/reviewer-plan/action`,
          {
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            method: "GET",
          },
        );
        const data = await response.json();

        if (!cancelled && response.ok && Array.isArray(data.tasks)) {
          setActionTaskCount(data.tasks.length);
        }
      } catch {
        if (!cancelled) {
          setActionTaskCount(0);
        }
      }
    }

    void refreshActionTaskCount();

    const unsubscribe = subscribeCaseActionQueueSync(workspace.case.id, () => {
      void refreshActionTaskCount();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [workspace.case.id]);

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
            <div className={workspaceHeaderTopRowClass}>
              <div className="min-w-0 flex-1">
                <h1 className="truncate font-heading text-3xl uppercase leading-none text-paper md:text-4xl">
                  {control.case.title}
                </h1>
              </div>
              <div className="flex w-fit shrink-0 flex-col items-end gap-2">
                <CaseDocumentSwitcher
                  className={documentSwitcherWidthClass}
                  items={documentSwitcherItems}
                />
                {hasChronology ? (
                  <Button
                    aria-label="Chronology"
                    className={cn(
                      "hover-theme-invert h-9 rounded-none border-paper/15 bg-ink px-2.5 text-paper",
                      showChronologySurface && "active-theme-invert",
                    )}
                    onClick={() => {
                      clearPreviewedSource();
                      setShowActionItems(false);
                      setShowChronology((current) => !current);
                    }}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <Clock aria-hidden />
                  </Button>
                ) : null}
                {hasActionItems ? (
                  <ReviewActionTrigger
                    className={showActionItemsSurface ? "active-theme-invert" : undefined}
                    onClick={() => {
                      setShowChronology(false);
                      setShowActionItems((current) => !current);
                    }}
                    queuedCount={actionTaskCount}
                  />
                ) : null}
              </div>
            </div>
          </header>

          {showChronologySurface ? (
            <WorkspaceSurface
              className={cn(
                "relative -mt-16 flex-1 bg-ink xl:self-center",
                sharedWorkspaceSurfaceWidthClass,
              )}
              data-case-chronology-surface
            >
              <div className="mx-auto flex min-h-0 w-[70%] max-w-full flex-1 flex-col">
                <CaseChronologySurface
                  className="flex min-h-0 flex-1 flex-col"
                  events={workspace.chronologyEvents}
                  sourceDocuments={sourceDocuments}
                  sourceSpans={workspace.sourceSpans}
                />
              </div>
            </WorkspaceSurface>
          ) : showActionItemsSurface ? (
            <WorkspaceSurface
              className={cn(
                "relative h-full min-h-0 flex-1 overflow-hidden bg-ink xl:self-center",
                sharedWorkspaceSurfaceWidthClass,
              )}
              data-case-action-items-surface
              mode="content"
            >
              <div className="flex h-full min-h-0 w-full flex-1 flex-col px-6 pb-4 pt-6">
                <ReviewActionContent
                  activeReviewItemId={effectiveActiveReviewItemId}
                  className="flex min-h-0 flex-1 flex-col"
                  control={control}
                  onActiveReviewItemChange={setActiveReviewItemId}
                  onActionQueueCountChange={setActionTaskCount}
                  sourceDocuments={sourceDocuments}
                />
              </div>
            </WorkspaceSurface>
          ) : showWorkspaceSurface ? (
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
                  data-case-preview-boundary
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
            className="absolute bottom-3 left-1/2 mx-auto w-full max-w-2xl -translate-x-1/2"
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
