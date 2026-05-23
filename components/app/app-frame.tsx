"use client";

import {
  Eye,
  FileText,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useDropzone } from "react-dropzone";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const cases = [
  { href: "/case/acme-v-glade", label: "Acme v. Glade" },
  { href: "/case/rivera-intake", label: "Rivera intake" },
  { href: "/case/northstar-review", label: "Northstar review" },
  { href: "/case/atlas-filing", label: "Atlas filing" },
];

function getFileKey(file: File) {
  return `${file.name}-${file.lastModified}`;
}

type AppFrameProps = {
  children: React.ReactNode;
};

export function AppFrame({ children }: AppFrameProps) {
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
            {cases.map((caseItem) => (
              <Link
                className="border border-paper/15 px-3 py-2 text-paper transition-colors hover:bg-paper hover:text-ink"
                href={caseItem.href}
                key={caseItem.label}
              >
                {caseItem.label}
              </Link>
            ))}
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
