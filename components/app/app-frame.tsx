"use client";

import {
  FolderOpen,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import type { DropEvent } from "react-dropzone";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import {
  ingestDocumentOcrAction,
  updateCaseTitleAction,
} from "@/app/(app)/actions";
import type { IngestedFileItem } from "@/components/app/ingested-file-types";
import { IngestedFilesList } from "@/components/app/ingested-files-list";
import { PdfViewer } from "@/components/app/pdf-viewer";
import { Button } from "@/components/ui/button";
import type { CaseSummaryDto, CaseType } from "@/lib/contracts/cases";
import { cn } from "@/lib/utils";

async function getDroppedFilesFromEvent(
  event: DropEvent
): Promise<Array<File | DataTransferItem>> {
  if (Array.isArray(event)) {
    return [];
  }

  if ("dataTransfer" in event && event.dataTransfer) {
    return Array.from(event.dataTransfer.files);
  }

  if (
    "target" in event &&
    event.target instanceof HTMLInputElement &&
    event.target.files instanceof FileList
  ) {
    return Array.from(event.target.files);
  }

  return [];
}

type AppFrameProps = {
  cases: CaseSummaryDto[];
  children: React.ReactNode;
};

const caseTypeIcons = {
  bankruptcy: Landmark,
  immigration: Plane,
  general: FolderOpen,
} satisfies Record<CaseType, React.ComponentType<{ className?: string }>>;

const MAX_CONCURRENT_OCR_UPLOADS = 3;

type EditableCaseLinkProps = {
  caseItem: CaseSummaryDto;
};

function EditableCaseLink({ caseItem }: EditableCaseLinkProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(caseItem.title);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const navigationTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const CaseTypeIcon = caseTypeIcons[caseItem.type];

  React.useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  React.useEffect(() => {
    return () => {
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
      }
    };
  }, []);

  function navigateToCase() {
    navigationTimerRef.current = setTimeout(() => {
      router.push(`/case/${caseItem.slug}`);
      navigationTimerRef.current = null;
    }, 180);
  }

  function beginEdit() {
    if (navigationTimerRef.current) {
      clearTimeout(navigationTimerRef.current);
      navigationTimerRef.current = null;
    }

    setErrorMessage(null);
    setDraftTitle(caseItem.title);
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraftTitle(caseItem.title);
    setErrorMessage(null);
    setIsEditing(false);
  }

  function saveTitle() {
    const trimmedTitle = draftTitle.trim();

    if (trimmedTitle === caseItem.title) {
      cancelEdit();
      return;
    }

    const formData = new FormData();
    formData.set("caseId", caseItem.id);
    formData.set("title", trimmedTitle);

    startTransition(async () => {
      const result = await updateCaseTitleAction(formData);

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setErrorMessage(null);
      setDraftTitle(result.title);
      setIsEditing(false);
      router.refresh();
    });
  }

  if (isEditing) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          saveTitle();
        }}
        className="flex items-center justify-between gap-3 border border-paper px-3 py-2 text-paper"
      >
        <input name="caseId" type="hidden" value={caseItem.id} />
        <input
          aria-invalid={Boolean(errorMessage)}
          aria-label={`Edit ${caseItem.title} case name`}
          className="min-w-0 flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-paper/35"
          disabled={isPending}
          name="title"
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelEdit();
            }
          }}
          ref={inputRef}
          value={draftTitle}
        />
        <CaseTypeIcon
          aria-label={caseItem.type}
          className="size-4 shrink-0 text-current/60"
        />
      </form>
    );
  }

  return (
    <button
      className="flex items-center justify-between gap-3 border border-paper/15 px-3 py-2 text-left text-paper transition-colors hover:bg-paper hover:text-ink"
      onClick={navigateToCase}
      onDoubleClick={beginEdit}
      type="button"
    >
      <span className="truncate">{caseItem.title}</span>
      <CaseTypeIcon
        aria-label={caseItem.type}
        className="size-4 shrink-0 text-current/60"
      />
    </button>
  );
}

export function AppFrame({ cases, children }: AppFrameProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [ingestedFiles, setIngestedFiles] = React.useState<IngestedFileItem[]>(
    []
  );
  const [selectedFileId, setSelectedFileId] = React.useState<string | null>(
    null
  );
  const [checkedFileIds, setCheckedFileIds] = React.useState<string[]>([]);
  const selectedFile = React.useMemo(
    () =>
      ingestedFiles.find((item) => item.id === selectedFileId)?.file ?? null,
    [ingestedFiles, selectedFileId]
  );

  const updateIngestedFile = React.useCallback(
    (fileId: string, patch: Partial<IngestedFileItem>) => {
      setIngestedFiles((currentFiles) =>
        currentFiles.map((currentFile) =>
          currentFile.id === fileId
            ? {
                ...currentFile,
                ...patch,
              }
            : currentFile
        )
      );
    },
    []
  );

  const processDroppedFile = React.useCallback(
    async (item: IngestedFileItem) => {
      const toastId = `ocr-${item.id}`;

      toast.loading("OCR processing", {
        description: item.file.name,
        id: toastId,
      });

      const formData = new FormData();
      formData.set("file", item.file);

      const result = await ingestDocumentOcrAction(formData);

      if (!result.ok) {
        updateIngestedFile(item.id, {
          errorMessage: result.message,
          ocrStatus: "failed",
        });
        toast.error("OCR failed", {
          description: result.message,
          id: toastId,
        });
        return;
      }

      let ocrStatus: IngestedFileItem["ocrStatus"] = "processing";

      if (result.status === "failed") {
        ocrStatus = "failed";
      } else if (result.cached) {
        ocrStatus = "cached";
      } else if (result.status === "ready") {
        ocrStatus = "ready";
      }

      if (ocrStatus === "failed") {
        updateIngestedFile(item.id, {
          errorMessage: result.errorMessage ?? "OCR failed.",
          expiresAt: result.expiresAt,
          ocrConversionId: result.conversionId,
          ocrStatus,
          pagesProcessed: result.pagesProcessed,
        });
        toast.error("OCR failed", {
          description: result.errorMessage ?? item.file.name,
          id: toastId,
        });
        return;
      }

      updateIngestedFile(item.id, {
        errorMessage: result.errorMessage ?? undefined,
        expiresAt: result.expiresAt,
        ocrConversionId: result.conversionId,
        ocrStatus,
        pagesProcessed: result.pagesProcessed,
      });

      if (ocrStatus === "cached") {
        toast.success("OCR cache reused", {
          description: item.file.name,
          id: toastId,
        });
        return;
      }

      if (ocrStatus === "ready") {
        toast.success("OCR ready", {
          description: item.file.name,
          id: toastId,
        });
        return;
      }

      toast.loading("OCR already processing", {
        description: item.file.name,
        id: toastId,
      });
    },
    [updateIngestedFile]
  );

  const processDroppedFiles = React.useCallback(
    async (fileItems: IngestedFileItem[]) => {
      const pendingFileItems = [...fileItems];
      const workers = Array.from(
        {
          length: Math.min(MAX_CONCURRENT_OCR_UPLOADS, pendingFileItems.length),
        },
        async () => {
          let item = pendingFileItems.shift();

          while (item) {
            await processDroppedFile(item);
            item = pendingFileItems.shift();
          }
        }
      );

      await Promise.all(workers);
    },
    [processDroppedFile]
  );

  const onDrop = React.useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      const acceptedFileItems = acceptedFiles.map((file) => ({
        file,
        id: crypto.randomUUID(),
        ocrStatus: "processing" as const,
      }));

      setIngestedFiles((currentFiles) => [
        ...acceptedFileItems,
        ...currentFiles,
      ]);
      setSelectedFileId(
        (currentFileId) => currentFileId ?? acceptedFileItems[0].id
      );
      void processDroppedFiles(acceptedFileItems);
    },
    [processDroppedFiles]
  );
  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    getFilesFromEvent: getDroppedFilesFromEvent,
    noClick: true,
    onDrop,
  });

  return (
    <div
      className={cn(
        "grid h-full w-full gap-0 overflow-hidden pl-6 transition-[grid-template-columns] lg:pl-8",
        isCollapsed ? "md:grid-cols-[4.5rem_1fr]" : "md:grid-cols-[18rem_1fr]"
      )}
    >
      <aside className="flex max-w-72 flex-col gap-8 overflow-hidden border-paper/15 py-8 text-sm text-paper/70 md:h-full md:border-r md:pr-8">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("flex flex-col gap-3", isCollapsed && "md:hidden")}>
            <p className="font-heading text-3xl uppercase leading-none text-paper">
              Cases
            </p>
          </div>
          <Button
            aria-label={isCollapsed ? "Expand side panel" : "Collapse side panel"}
            className="rounded-none border border-paper/15 bg-ink text-paper hover:bg-paper hover:text-ink"
            onClick={() => setIsCollapsed((current) => !current)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {isCollapsed ? (
              <PanelLeftOpen data-icon="inline-start" />
            ) : (
              <PanelLeftClose data-icon="inline-start" />
            )}
          </Button>
        </div>

        <section className={cn("flex flex-col gap-3", isCollapsed && "md:hidden")}>
          <nav
            aria-label="Cases"
            className="flex max-h-[calc(100vh-13rem)] flex-col gap-2 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {cases.length > 0 ? (
              cases.map((caseItem) => (
                <EditableCaseLink caseItem={caseItem} key={caseItem.id} />
              ))
            ) : (
              <p className="border border-paper/15 px-3 py-2 text-paper/55">
                No cases found.
              </p>
            )}
          </nav>
        </section>
      </aside>

      <div
        {...getRootProps({
          className: cn(
            "relative h-full overflow-hidden outline-none",
            isDragActive && "bg-paper/5"
          ),
          "data-dropzone": "app-content",
        })}
      >
        <input {...getInputProps()} />

        {isDragActive ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 right-0 z-10 flex items-center justify-center border border-dashed border-paper/40 bg-ink/80 text-paper"
            data-drop-overlay="app-content"
          >
            <p className="font-heading text-4xl uppercase leading-none">
              Drop files
            </p>
          </div>
        ) : null}

        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6 overflow-hidden px-8 py-8">
          <div className="grid min-h-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)]">
            <div className="min-w-0">{children}</div>
            <IngestedFilesList
              checkedFileIds={checkedFileIds}
              files={ingestedFiles}
              onCheckedFileIdsChange={setCheckedFileIds}
              onDeleteFile={(fileId) => {
                const deletedFile = ingestedFiles.find(
                  (item) => item.id === fileId
                )?.file;

                setIngestedFiles((currentFiles) =>
                  currentFiles.filter((currentFile) => currentFile.id !== fileId)
                );
                setCheckedFileIds((currentIds) =>
                  currentIds.filter((id) => id !== fileId)
                );
                setSelectedFileId((currentId) =>
                  currentId === fileId ? null : currentId
                );
                toast("File removed", {
                  description: deletedFile?.name,
                });
              }}
              onSelectFile={setSelectedFileId}
              selectedFileId={selectedFileId}
            />
          </div>

          <PdfViewer file={selectedFile} />
        </div>
      </div>
    </div>
  );
}
