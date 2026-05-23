"use client";

import {
  Eye,
  FileText,
  FolderOpen,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  Plane,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useDropzone } from "react-dropzone";

import { updateCaseTitleAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { CaseSummaryDto, CaseType } from "@/lib/contracts/cases";
import { cn } from "@/lib/utils";

function getFileKey(file: File) {
  return `${file.name}-${file.lastModified}`;
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
  const [ingestedFiles, setIngestedFiles] = React.useState<File[]>([]);
  const [selectedFileKey, setSelectedFileKey] = React.useState<string | null>(
    null
  );
  const [checkedFileKeys, setCheckedFileKeys] = React.useState<string[]>([]);
  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) {
      return;
    }

    setIngestedFiles((currentFiles) => [...acceptedFiles, ...currentFiles]);
  }, []);
  const { getInputProps, getRootProps, isDragActive } = useDropzone({
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

        <div className="flex flex-col gap-6 px-8 py-8">
          {children}

          {ingestedFiles.length > 0 ? (
            <section className="flex w-full max-w-xl flex-col gap-2 text-sm text-paper/70">
              <p className="text-xs font-medium uppercase tracking-wide text-paper/45">
                Ingested files
              </p>
              <ol className="flex max-h-[13.5rem] flex-col gap-2 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {ingestedFiles.map((file) => {
                  const fileKey = getFileKey(file);
                  const isSelected = selectedFileKey === fileKey;
                  const isChecked = checkedFileKeys.includes(fileKey);

                  return (
                    <li key={fileKey}>
                      <div
                        className={cn(
                          "flex h-9 items-center gap-2 border border-paper/15 px-2 text-paper transition-colors hover:bg-paper/10",
                          isSelected &&
                            "border-paper bg-paper text-ink hover:bg-paper"
                        )}
                      >
                        <Checkbox
                          aria-label={`Select ${file.name}`}
                          checked={isChecked}
                          className="rounded-none border-transparent bg-transparent text-current data-checked:border-transparent data-checked:bg-transparent data-checked:text-current"
                          onCheckedChange={(checked) => {
                            setCheckedFileKeys((currentKeys) =>
                              checked
                                ? [...currentKeys, fileKey]
                                : currentKeys.filter((key) => key !== fileKey)
                            );
                          }}
                        />
                        <Button
                          aria-pressed={isSelected}
                          className={cn(
                            "min-w-0 flex-1 justify-start overflow-hidden rounded-none border-0 bg-transparent px-1 text-paper hover:!bg-transparent hover:!text-paper",
                            isSelected &&
                              "text-ink hover:!bg-transparent hover:!text-ink"
                          )}
                          onClick={() => setSelectedFileKey(fileKey)}
                          type="button"
                          variant="ghost"
                        >
                          <FileText data-icon="inline-start" />
                          <span className="truncate">{file.name}</span>
                        </Button>
                        <div className="flex items-center gap-1">
                          <Button
                            aria-label={`View ${file.name}`}
                            className={cn(
                              "rounded-none border-0 bg-transparent text-paper hover:!bg-transparent hover:!text-paper",
                              isSelected &&
                                "text-ink hover:!bg-transparent hover:!text-ink"
                            )}
                            onClick={() => setSelectedFileKey(fileKey)}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <Eye data-icon="inline-start" />
                          </Button>
                          <Button
                            aria-label={`Delete ${file.name}`}
                            className={cn(
                              "rounded-none border-0 bg-transparent text-paper hover:!bg-transparent hover:!text-paper",
                              isSelected &&
                                "text-ink hover:!bg-transparent hover:!text-ink"
                            )}
                            onClick={() => {
                              setIngestedFiles((currentFiles) =>
                                currentFiles.filter(
                                  (currentFile) =>
                                    getFileKey(currentFile) !== fileKey
                                )
                              );
                              setCheckedFileKeys((currentKeys) =>
                                currentKeys.filter((key) => key !== fileKey)
                              );
                              setSelectedFileKey((currentKey) =>
                                currentKey === fileKey ? null : currentKey
                              );
                            }}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 data-icon="inline-start" />
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
