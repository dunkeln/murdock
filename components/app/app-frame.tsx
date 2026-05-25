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
import Link from "next/link";
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
import {
  CaseDocumentSwitcher,
  type CaseDocumentSwitcherItem,
} from "@/components/app/case-workspace/components/case-document-switcher";
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

function getFileIdentityKey(file: File) {
  return [file.name, file.size, file.type].join(":");
}

function getIngestedFileIdentityKey(item: IngestedFileItem) {
  return [
    item.fileName,
    item.fileSizeBytes ?? item.file.size,
    item.mimeType ?? item.file.type,
  ].join(":");
}

type ReadyOcrFile = {
  caseDocumentId: string | null;
  fileName: string;
  itemId: string;
  ocrConversionId: string;
};

type EditableCaseLinkProps = {
  caseItem: CaseSummaryDto;
  isActive: boolean;
  isDeleting: boolean;
  onDeleteCase: (caseItem: CaseSummaryDto) => void;
};

function EditableCaseLink({
  caseItem,
  isActive,
  isDeleting,
  onDeleteCase,
}: EditableCaseLinkProps) {
  const router = useRouter();
  const clickTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(caseItem.title);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const CaseTypeIcon = caseTypeIcons[caseItem.type];

  React.useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  React.useEffect(
    () => () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    },
    []
  );

  function beginEdit() {
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

  function navigateToCase() {
    router.push(`/case/${caseItem.slug}`);
  }

  function handleCaseClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      navigateToCase();
    }, 180);
  }

  function handleCaseDoubleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    beginEdit();
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

  const caseLink = (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-3 border border-paper/15 px-3 py-2 text-left text-paper transition-colors hover:bg-paper hover:text-ink",
        isActive && "border-paper/40 bg-paper/10",
      )}
      href={`/case/${caseItem.slug}`}
      onClick={handleCaseClick}
      onDoubleClick={handleCaseDoubleClick}
    >
      <span className="truncate">{caseItem.title}</span>
      <CaseTypeIcon
        aria-label={caseItem.type}
        className="size-4 shrink-0 text-current/60"
      />
    </Link>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{caseLink}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-28 rounded-none border border-paper/15 bg-ink p-1 text-paper shadow-none ring-0">
        <ContextMenuGroup>
          <ContextMenuItem
            className="rounded-none text-paper focus:bg-paper focus:text-ink"
            disabled={isPending}
            onSelect={beginEdit}
          >
            Edit name
          </ContextMenuItem>
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
  const caseWorkspaceOwnsFiles = pathname.startsWith("/case/");
  const [isCreatingCase, startCreateCaseTransition] = React.useTransition();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
  const [deletingCaseId, setDeletingCaseId] = React.useState<string | null>(
    null
  );
  const [ingestedFiles, setIngestedFiles] = React.useState<IngestedFileItem[]>(
    []
  );
  const [previewedFileId, setPreviewedFileId] = React.useState<string | null>(
    null
  );
  const [includedFileIds, setIncludedFileIds] = React.useState<string[]>([]);
  const includedFileIdsRef = React.useRef<string[]>([]);
  const previewedFile = React.useMemo(
    () =>
      ingestedFiles.find((item) => item.id === previewedFileId)?.file ?? null,
    [ingestedFiles, previewedFileId]
  );
  const activeCase = React.useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const caseSlug = segments[0] === "case" ? segments[1] : null;

    return cases.find((caseItem) => caseItem.slug === caseSlug) ?? null;
  }, [cases, pathname]);

  React.useEffect(() => {
    includedFileIdsRef.current = includedFileIds;
  }, [includedFileIds]);

  const changeIncludedFileIds = React.useCallback((fileIds: string[]) => {
    includedFileIdsRef.current = fileIds;
    setIncludedFileIds(fileIds);
  }, []);

  const changeFileInclusion = React.useCallback(
    (fileId: string, included: boolean) => {
      const currentIds = includedFileIdsRef.current;
      const nextIds = included
        ? Array.from(new Set([...currentIds, fileId]))
        : currentIds.filter((id) => id !== fileId);

      changeIncludedFileIds(nextIds);
    },
    [changeIncludedFileIds]
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

  const shapeReadyFiles = React.useCallback(
    async (readyFiles: ReadyOcrFile[]) => {
      if (!activeCase || readyFiles.length === 0) {
        return;
      }

      const includedIds = new Set(includedFileIdsRef.current);
      const filesToShape = readyFiles.filter((file) => includedIds.has(file.itemId));

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
          : `${filesToShape.length} included files`;

      toast.loading("Adding source to matter", {
        description,
        id: toastId,
      });

      const shapeFormData = new FormData();
      shapeFormData.set("caseId", activeCase.id);

      for (const file of filesToShape) {
        shapeFormData.append(
          "files",
          JSON.stringify({
            caseDocumentId: file.caseDocumentId,
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
        toast.error("Source needs review", {
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
          ? "Source needs review"
          : "Matter context updated",
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

      toast.loading("Reading source", {
        description: item.fileName,
        id: toastId,
      });

      const formData = new FormData();
      formData.set("file", item.file);
      if (activeCase) {
        formData.set("caseId", activeCase.id);
      }

      const result = await ingestDocumentOcrAction(formData);

      if (!result.ok) {
        updateIngestedFile(item.id, {
          errorMessage: result.message,
          ocrStatus: "failed",
        });
        toast.error("Source could not be read", {
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
          errorMessage: result.errorMessage ?? "Source could not be read.",
          expiresAt: result.expiresAt,
          caseDocumentId: result.caseDocumentId,
          ocrConversionId: result.conversionId,
          ocrStatus,
          pagesProcessed: result.pagesProcessed,
        });
        toast.error("Source could not be read", {
          description: result.errorMessage ?? item.fileName,
          id: toastId,
        });
        return null;
      }

      updateIngestedFile(item.id, {
        errorMessage: result.errorMessage ?? undefined,
        expiresAt: result.expiresAt,
        caseDocumentId: result.caseDocumentId,
        ocrConversionId: result.conversionId,
        ocrStatus,
        pagesProcessed: result.pagesProcessed,
      });

      if (ocrStatus === "cached") {
        toast.success("Source text ready", {
          description: item.fileName,
          id: toastId,
        });
      } else if (ocrStatus === "ready") {
        toast.success("Source text ready", {
          description: item.fileName,
          id: toastId,
        });
      } else {
        toast.loading("Source is still being read", {
          description: item.fileName,
          id: toastId,
        });
        return null;
      }

      return {
        caseDocumentId: result.caseDocumentId,
        fileName: item.fileName,
        itemId: item.id,
        ocrConversionId: result.conversionId,
      };
    },
    [activeCase, updateIngestedFile]
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

      const existingFileKeys = new Set(
        ingestedFiles.map(getIngestedFileIdentityKey),
      );
      const uniqueFiles = acceptedFiles.filter((file) => {
        const fileKey = getFileIdentityKey(file);

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
        caseId: activeCase?.id,
        file,
        fileName: file.name,
        fileSizeBytes: file.size,
        id: crypto.randomUUID(),
        mimeType: file.type || "application/octet-stream",
        ocrStatus: "processing" as const,
        shapingStatus: activeCase ? ("shaping_pending" as const) : undefined,
      }));
      const acceptedFileIds = acceptedFileItems.map((item) => item.id);

      setIngestedFiles((currentFiles) => [
        ...acceptedFileItems,
        ...currentFiles,
      ]);
      setIncludedFileIds((currentIds) => {
        const nextIds = Array.from(new Set([...currentIds, ...acceptedFileIds]));

        includedFileIdsRef.current = nextIds;
        return nextIds;
      });
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
      const deletedFile = ingestedFiles.find((item) => item.id === fileId);

      setIngestedFiles((currentFiles) =>
        currentFiles.filter((currentFile) => currentFile.id !== fileId)
      );
      setIncludedFileIds((currentIds) => {
        const nextIds = currentIds.filter((id) => id !== fileId);

        includedFileIdsRef.current = nextIds;
        return nextIds;
      });
      setPreviewedFileId((currentId) => (currentId === fileId ? null : currentId));
      toast("File removed", {
        description: deletedFile?.fileName,
      });
    },
    [ingestedFiles]
  );

  const documentSwitcherItems = React.useMemo<CaseDocumentSwitcherItem[]>(
    () =>
      ingestedFiles.map((item) => ({
        id: `transient:${item.id}`,
        isIncluded: includedFileIds.includes(item.id),
        isPreviewed: previewedFileId === item.id,
        label: item.fileName,
        onDelete: () => deleteIngestedFile(item.id),
        onIncludeChange: (included: boolean) =>
          changeFileInclusion(item.id, included),
        onPreviewChange: (previewed: boolean) =>
          setPreviewedFileId(previewed ? item.id : null),
        variant: "transient" as const,
      })),
    [
      changeFileInclusion,
      deleteIngestedFile,
      includedFileIds,
      ingestedFiles,
      previewedFileId,
    ]
  );

  const ingestedFilesContextValue = React.useMemo(
    () => ({
      includedFileIds,
      files: ingestedFiles,
      onIncludedFileIdsChange: changeIncludedFileIds,
      onDeleteFile: deleteIngestedFile,
      onPreviewFile: setPreviewedFileId,
      previewedFile,
      previewedFileId,
    }),
    [
      includedFileIds,
      changeIncludedFileIds,
      deleteIngestedFile,
      ingestedFiles,
      previewedFile,
      previewedFileId,
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
        "grid h-full min-h-0 w-full grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden pl-6 md:grid-rows-[minmax(0,1fr)] lg:pl-8",
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
            className="hover-theme-invert rounded-none border-paper/15 bg-ink text-paper"
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
            className="hover-theme-invert w-full justify-start rounded-none border border-paper/15 bg-ink text-paper"
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
            {cases.map((caseItem) => (
              <EditableCaseLink
                caseItem={caseItem}
                isActive={activeCase?.id === caseItem.id}
                isDeleting={deletingCaseId === caseItem.id}
                key={caseItem.id}
                onDeleteCase={deleteCase}
              />
            ))}
          </nav>
        </section>
      </aside>

      <div
        {...getRootProps({
          className: cn(
            "relative h-full min-h-0 overflow-hidden outline-none",
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
          <div className="flex h-full min-h-0 flex-col overflow-hidden px-8 pb-0 pt-8">
            <div
              className={cn(
                "grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden",
                ingestedFiles.length > 0 &&
                  !caseWorkspaceOwnsFiles &&
                  "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)]"
              )}
            >
              <div className="h-full min-h-0 min-w-0">{children}</div>
              {caseWorkspaceOwnsFiles ? null : (
                <CaseDocumentSwitcher items={documentSwitcherItems} />
              )}
            </div>
          </div>
        </IngestedFilesProvider>
      </div>
    </div>
  );
}
