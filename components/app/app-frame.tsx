"use client";

import {
  FolderOpen,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  Plus,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import type { DropEvent } from "react-dropzone";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import {
  createCaseAction,
  deleteCaseAction,
  ingestDocumentOcrAction,
  shapeWorkspaceFromOcrAction,
  updateCaseTitleAction,
} from "@/app/(app)/actions";
import type { IngestedFileItem } from "@/components/app/ingested-file-types";
import { IngestedFilesProvider } from "@/components/app/ingested-files-context";
import { IngestedFilesList } from "@/components/app/ingested-files-list";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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

function getFileKey(file: File) {
  return [file.name, file.size, file.lastModified, file.type].join(":");
}

type ReadyOcrFile = {
  fileName: string;
  itemId: string;
  ocrConversionId: string;
};

type EditableCaseLinkProps = {
  caseItem: CaseSummaryDto;
  isDeleting: boolean;
  onDeleteCase: (caseItem: CaseSummaryDto) => void;
};

function EditableCaseLink({
  caseItem,
  isDeleting,
  onDeleteCase,
}: EditableCaseLinkProps) {
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

  const caseButton = (
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{caseButton}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-28 rounded-none border border-paper/15 bg-ink p-1 text-paper shadow-none ring-0">
        <ContextMenuGroup>
          <ContextMenuItem
            className="rounded-none text-paper focus:bg-paper focus:text-ink data-[variant=destructive]:text-paper data-[variant=destructive]:focus:bg-paper data-[variant=destructive]:focus:text-ink"
            disabled={isDeleting}
            onSelect={() => onDeleteCase(caseItem)}
            variant="destructive"
          >
            <Trash2 data-icon="inline-start" />
            Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function AppFrame({ cases, children }: AppFrameProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCreatingCase, startCreateCaseTransition] = React.useTransition();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [deletingCaseId, setDeletingCaseId] = React.useState<string | null>(
    null
  );
  const [ingestedFiles, setIngestedFiles] = React.useState<IngestedFileItem[]>(
    []
  );
  const [selectedFileId, setSelectedFileId] = React.useState<string | null>(
    null
  );
  const [checkedFileIds, setCheckedFileIds] = React.useState<string[]>([]);
  const checkedFileIdsRef = React.useRef<string[]>([]);
  const selectedFile = React.useMemo(
    () =>
      ingestedFiles.find((item) => item.id === selectedFileId)?.file ?? null,
    [ingestedFiles, selectedFileId]
  );
  const activeCase = React.useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const caseSlug = segments[0] === "case" ? segments[1] : null;

    return cases.find((caseItem) => caseItem.slug === caseSlug) ?? null;
  }, [cases, pathname]);

  React.useEffect(() => {
    checkedFileIdsRef.current = checkedFileIds;
  }, [checkedFileIds]);

  const changeCheckedFileIds = React.useCallback((fileIds: string[]) => {
    checkedFileIdsRef.current = fileIds;
    setCheckedFileIds(fileIds);
  }, []);

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

  const shapeReadyFiles = React.useCallback(
    async (readyFiles: ReadyOcrFile[]) => {
      if (!activeCase || readyFiles.length === 0) {
        return;
      }

      const checkedIds = new Set(checkedFileIdsRef.current);
      const filesToShape = readyFiles.filter((file) => checkedIds.has(file.itemId));

      if (filesToShape.length === 0) {
        return;
      }

      for (const file of filesToShape) {
        updateIngestedFile(file.itemId, {
          shapingStatus: "shaping_started",
        });
      }

      const toastId = `shape-${crypto.randomUUID()}`;
      const description =
        filesToShape.length === 1
          ? filesToShape[0]!.fileName
          : `${filesToShape.length} checked files`;

      toast.loading("Shaping workspace controls", {
        description,
        id: toastId,
      });

      const shapeFormData = new FormData();
      shapeFormData.set("caseId", activeCase.id);

      for (const file of filesToShape) {
        shapeFormData.append(
          "files",
          JSON.stringify({
            fileName: file.fileName,
            ocrConversionId: file.ocrConversionId,
          })
        );
      }

      const shapeResult = await shapeWorkspaceFromOcrAction(shapeFormData);

      if (!shapeResult.ok) {
        for (const file of filesToShape) {
          updateIngestedFile(file.itemId, {
            shapingErrorMessage: shapeResult.message,
            shapingRunId: shapeResult.runId ?? undefined,
            shapingStatus: "failed",
          });
        }
        toast.error("Workspace controls need review", {
          description: shapeResult.message,
          id: toastId,
        });
        return;
      }

      for (const file of filesToShape) {
        updateIngestedFile(file.itemId, {
          shapingRunId: shapeResult.runId,
          shapingStatus:
            shapeResult.status === "needs_review" ? "needs_review" : "ready",
        });
      }
      toast.success(
        shapeResult.status === "needs_review"
          ? "Workspace controls need review"
          : "Workspace controls ready",
        {
          description,
          id: toastId,
        }
      );
      router.refresh();
    },
    [activeCase, router, updateIngestedFile]
  );

  const processDroppedFile = React.useCallback(
    async (item: IngestedFileItem): Promise<ReadyOcrFile | null> => {
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
        return null;
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
        return null;
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
      } else if (ocrStatus === "ready") {
        toast.success("OCR ready", {
          description: item.file.name,
          id: toastId,
        });
      } else {
        toast.loading("OCR already processing", {
          description: item.file.name,
          id: toastId,
        });
        return null;
      }

      return {
        fileName: item.file.name,
        itemId: item.id,
        ocrConversionId: result.conversionId,
      };
    },
    [updateIngestedFile]
  );

  const processDroppedFiles = React.useCallback(
    async (fileItems: IngestedFileItem[]) => {
      const pendingFileItems = [...fileItems];
      const readyFiles: ReadyOcrFile[] = [];
      const workers = Array.from(
        {
          length: Math.min(MAX_CONCURRENT_OCR_UPLOADS, pendingFileItems.length),
        },
        async () => {
          let item = pendingFileItems.shift();

          while (item) {
            const readyFile = await processDroppedFile(item);

            if (readyFile) {
              readyFiles.push(readyFile);
            }
            item = pendingFileItems.shift();
          }
        }
      );

      await Promise.all(workers);
      await shapeReadyFiles(readyFiles);
    },
    [processDroppedFile, shapeReadyFiles]
  );

  const onDrop = React.useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) {
        return;
      }

      const existingFileKeys = new Set(ingestedFiles.map((item) => getFileKey(item.file)));
      const uniqueFiles = acceptedFiles.filter((file) => {
        const fileKey = getFileKey(file);

        if (existingFileKeys.has(fileKey)) {
          return false;
        }

        existingFileKeys.add(fileKey);
        return true;
      });

      if (uniqueFiles.length === 0) {
        toast("File already added", {
          description: acceptedFiles[0]?.name,
        });
        return;
      }

      const acceptedFileItems = uniqueFiles.map((file) => ({
        file,
        id: crypto.randomUUID(),
        ocrStatus: "processing" as const,
        shapingStatus: activeCase ? ("shaping_pending" as const) : undefined,
      }));
      const acceptedFileIds = acceptedFileItems.map((item) => item.id);

      setIngestedFiles((currentFiles) => [
        ...acceptedFileItems,
        ...currentFiles,
      ]);
      setCheckedFileIds((currentIds) => {
        const nextIds = Array.from(new Set([...currentIds, ...acceptedFileIds]));

        checkedFileIdsRef.current = nextIds;
        return nextIds;
      });
      setSelectedFileId(
        (currentFileId) => currentFileId ?? acceptedFileItems[0].id
      );
      if (uniqueFiles.length < acceptedFiles.length) {
        toast("Duplicate file skipped", {
          description: acceptedFiles[0]?.name,
        });
      }

      void processDroppedFiles(acceptedFileItems);
    },
    [activeCase, ingestedFiles, processDroppedFiles]
  );
  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    getFilesFromEvent: getDroppedFilesFromEvent,
    noClick: true,
    onDrop,
  });

  const deleteIngestedFile = React.useCallback(
    (fileId: string) => {
      const deletedFile = ingestedFiles.find((item) => item.id === fileId)?.file;

      setIngestedFiles((currentFiles) =>
        currentFiles.filter((currentFile) => currentFile.id !== fileId)
      );
      setCheckedFileIds((currentIds) => {
        const nextIds = currentIds.filter((id) => id !== fileId);

        checkedFileIdsRef.current = nextIds;
        return nextIds;
      });
      setSelectedFileId((currentId) => (currentId === fileId ? null : currentId));
      toast("File removed", {
        description: deletedFile?.name,
      });
    },
    [ingestedFiles]
  );
  const ingestedFilesContextValue = React.useMemo(
    () => ({
      checkedFileIds,
      files: ingestedFiles,
      onCheckedFileIdsChange: changeCheckedFileIds,
      onDeleteFile: deleteIngestedFile,
      onSelectFile: setSelectedFileId,
      selectedFile,
      selectedFileId,
    }),
    [
      checkedFileIds,
      changeCheckedFileIds,
      deleteIngestedFile,
      ingestedFiles,
      selectedFile,
      selectedFileId,
    ]
  );

  function createCase() {
    startCreateCaseTransition(async () => {
      const result = await createCaseAction();

      if (!result.ok) {
        toast.error("Case could not be created", {
          description: result.message,
        });
        return;
      }

      toast.success("Case created", {
        description: result.title,
      });
      router.refresh();
      router.push(`/case/${result.slug}`);
    });
  }

  function deleteCase(caseItem: CaseSummaryDto) {
    setDeletingCaseId(caseItem.id);

    const formData = new FormData();
    formData.set("caseId", caseItem.id);

    startCreateCaseTransition(async () => {
      const result = await deleteCaseAction(formData);

      setDeletingCaseId(null);

      if (!result.ok) {
        toast.error("Case could not be deleted", {
          description: result.message,
        });
        return;
      }

      toast.success("Case deleted", {
        description: result.title,
      });
      router.refresh();

      if (activeCase?.id === caseItem.id) {
        router.push("/dashboard");
      }
    });
  }

  return (
    <div
      className={cn(
        "grid h-full w-full grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden pl-6 md:grid-rows-[minmax(0,1fr)] lg:pl-8",
        isSidebarCollapsed
          ? "md:grid-cols-[4rem_1fr]"
          : "md:grid-cols-[18rem_1fr]"
      )}
    >
      <aside
        className={cn(
          "flex flex-col gap-8 overflow-hidden border-paper/15 py-8 text-sm text-paper/70 md:h-full md:border-r",
          isSidebarCollapsed ? "max-w-16 pr-4" : "max-w-72 md:pr-8"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {!isSidebarCollapsed ? (
            <p className="font-heading text-2xl uppercase leading-none text-paper">
              Cases
            </p>
          ) : null}
          <Button
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-none border-paper/15 bg-ink text-paper hover:bg-paper hover:text-ink"
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen data-icon="inline-start" />
            ) : (
              <PanelLeftClose data-icon="inline-start" />
            )}
          </Button>
        </div>

        <section
          className={cn("flex flex-col gap-3", isSidebarCollapsed && "hidden")}
        >
          <Button
            className="w-full justify-start rounded-none border border-paper bg-paper text-ink hover:bg-paper/90 hover:text-ink"
            disabled={isCreatingCase}
            onClick={createCase}
            type="button"
            variant="ghost"
          >
            <Plus data-icon="inline-start" />
            Add case
          </Button>
          <nav
            aria-label="Cases"
            className="flex max-h-[calc(100vh-13rem)] flex-col gap-2 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {cases.length > 0 ? (
              cases.map((caseItem) => (
                <EditableCaseLink
                  caseItem={caseItem}
                  isDeleting={deletingCaseId === caseItem.id}
                  key={caseItem.id}
                  onDeleteCase={deleteCase}
                />
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

        <IngestedFilesProvider value={ingestedFilesContextValue}>
          <div className="grid h-full min-h-0 gap-6 overflow-hidden px-8 py-8">
            <div
              className={cn(
                "grid h-full min-h-0 grid-cols-1 gap-6 overflow-hidden",
                ingestedFiles.length > 0 &&
                  "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)]"
              )}
            >
              <div className="min-h-0 min-w-0">{children}</div>
              <IngestedFilesList
                checkedFileIds={checkedFileIds}
                files={ingestedFiles}
                onCheckedFileIdsChange={changeCheckedFileIds}
                onDeleteFile={deleteIngestedFile}
                onSelectFile={setSelectedFileId}
                selectedFileId={selectedFileId}
              />
            </div>
          </div>
        </IngestedFilesProvider>
      </div>
    </div>
  );
}
