"use client";

import { AlertCircle, FileText, Trash2 } from "lucide-react";

import { useIngestedFiles } from "@/components/app/ingested-files-context";
import type { IngestedFileItem } from "@/components/app/ingested-file-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toggle } from "@/components/ui/toggle";
import type { CaseWorkspaceSourceDocumentDto } from "@/lib/contracts/case-workspace";
import { cn } from "@/lib/utils";

type CaseDocumentSwitcherProps = {
  className?: string;
  documents: CaseWorkspaceSourceDocumentDto[];
  onSelectedDocumentChange: (documentId: string | null) => void;
  selectedDocumentId: string | null;
};

function isFailed(item: IngestedFileItem) {
  return item.ocrStatus === "failed" || item.shapingStatus === "failed";
}

function SourceIcon({ item }: { item: IngestedFileItem }) {
  if (isFailed(item)) {
    return <AlertCircle className="size-3" data-icon="inline-start" />;
  }

  return <FileText className="size-3" data-icon="inline-start" />;
}

export function CaseDocumentSwitcher({
  className,
  documents,
  onSelectedDocumentChange,
  selectedDocumentId,
}: CaseDocumentSwitcherProps) {
  const intake = useIngestedFiles();
  const persistedDocumentIds = new Set(
    documents.flatMap((document) =>
      document.caseDocumentId ? [document.caseDocumentId] : [],
    ),
  );
  const transientFiles = intake.files.filter(
    (item) => !item.caseDocumentId || !persistedDocumentIds.has(item.caseDocumentId),
  );
  const itemCount = documents.length + transientFiles.length;
  const isScrollable = itemCount > 3;

  if (itemCount === 0) {
    return null;
  }

  const documentItems = (
    <ol className="flex flex-col gap-1">
      {documents.map((document) => {
        const isSelected = selectedDocumentId === document.id;

        return (
          <li key={document.id}>
            <button
              aria-pressed={isSelected}
              className={cn(
                "grid h-8 w-full grid-cols-[0.75rem_minmax(0,1fr)_1rem] items-center gap-2 border border-paper/15 px-2.5 text-left text-paper transition-colors hover:bg-paper/10",
                isSelected && "border-paper bg-paper text-ink hover:bg-paper",
              )}
              onClick={() => onSelectedDocumentChange(isSelected ? null : document.id)}
              type="button"
            >
              <FileText className="size-3" data-icon="inline-start" />
              <span className="truncate">{document.fileName}</span>
              <span aria-hidden="true" />
            </button>
          </li>
        );
      })}
      {transientFiles.map((item) => {
        const isChecked = intake.checkedFileIds.includes(item.id);
        const isSelected = intake.selectedFileId === item.id;

        return (
          <li key={item.id}>
            <div
              className={cn(
                "grid h-8 grid-cols-[0.75rem_minmax(0,1fr)_1rem] items-center gap-2 border border-paper/15 px-2.5 text-paper transition-colors hover:bg-paper/10",
                isSelected && "border-paper bg-paper text-ink hover:bg-paper",
              )}
            >
              <Checkbox
                aria-label={`Include ${item.fileName} in case context`}
                checked={isChecked}
                className="rounded-none border-transparent bg-transparent text-current data-checked:border-transparent data-checked:bg-transparent data-checked:text-current"
                onCheckedChange={(checked) => {
                  intake.onCheckedFileIdsChange(
                    checked
                      ? [...intake.checkedFileIds, item.id]
                      : intake.checkedFileIds.filter((id) => id !== item.id),
                  );
                }}
              />
              <Toggle
                aria-label={`Open ${item.fileName}`}
                className={cn(
                  "h-auto max-w-full min-w-0 justify-start gap-2 overflow-hidden rounded-none border-0 bg-transparent p-0 text-paper hover:!bg-transparent hover:!text-paper aria-pressed:!bg-transparent has-data-[icon=inline-start]:pl-0",
                  isSelected && "text-ink hover:!bg-transparent hover:!text-ink",
                )}
                onPressedChange={(pressed) => {
                  onSelectedDocumentChange(null);
                  intake.onSelectFile(pressed ? item.id : null);
                }}
                pressed={isSelected}
              >
                <SourceIcon item={item} />
                <span className="truncate">{item.fileName}</span>
              </Toggle>
              <div className="flex size-6 items-center justify-end overflow-hidden">
                <Button
                  aria-label={`Remove ${item.fileName}`}
                  className={cn(
                    "size-6 rounded-none border-0 bg-transparent p-0 text-paper hover:!bg-transparent hover:!text-paper",
                    isSelected && "text-ink hover:!bg-transparent hover:!text-ink",
                  )}
                  onClick={() => intake.onDeleteFile(item.id)}
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
  );

  return (
    <section
      aria-label="Case documents"
      className={cn(
        "w-full max-w-[30rem] min-w-0 text-sm text-paper/70 lg:w-[min(30rem,38vw)] lg:max-w-none",
        className,
      )}
    >
      {isScrollable ? (
        <ScrollArea className="h-[7.25rem] pr-2">{documentItems}</ScrollArea>
      ) : (
        documentItems
      )}
    </section>
  );
}
