"use client";

import { AlertCircle, FileText, Trash2 } from "lucide-react";

import type { IngestedFileItem } from "@/components/app/ingested-file-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

type IngestedFilesListProps = {
  checkedFileIds: string[];
  files: IngestedFileItem[];
  onCheckedFileIdsChange: (fileIds: string[]) => void;
  onDeleteFile: (fileId: string) => void;
  onSelectFile: (fileId: string | null) => void;
  selectedFileId: string | null;
};

export function IngestedFilesList({
  checkedFileIds,
  files,
  onCheckedFileIdsChange,
  onDeleteFile,
  onSelectFile,
  selectedFileId,
}: IngestedFilesListProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <section className="flex w-full max-w-md justify-self-end flex-col text-sm text-paper/70">
      <ol className="flex max-h-[13.5rem] flex-col gap-2 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {files.map((item) => {
          const isSelected = selectedFileId === item.id;
          const isChecked = checkedFileIds.includes(item.id);

          return (
            <li key={item.id}>
              <div
                className={cn(
                  "grid h-9 grid-cols-[1rem_minmax(0,1fr)_1.5rem] items-center gap-3 border border-paper/15 px-3 text-paper transition-colors hover:bg-paper/10",
                  isSelected && "border-paper bg-paper text-ink hover:bg-paper"
                )}
              >
                <Checkbox
                  aria-label={`Select ${item.file.name}`}
                  checked={isChecked}
                  className="rounded-none border-transparent bg-transparent text-current data-checked:border-transparent data-checked:bg-transparent data-checked:text-current"
                  onCheckedChange={(checked) => {
                    onCheckedFileIdsChange(
                      checked
                        ? [...checkedFileIds, item.id]
                        : checkedFileIds.filter((id) => id !== item.id)
                    );
                  }}
                />
                <Toggle
                  aria-label={`Show ${item.file.name}`}
                  className={cn(
                    "h-auto max-w-full min-w-0 justify-start gap-2 overflow-hidden rounded-none border-0 bg-transparent p-0 text-paper hover:!bg-transparent hover:!text-paper aria-pressed:!bg-transparent has-data-[icon=inline-start]:pl-0",
                    isSelected && "text-ink hover:!bg-transparent hover:!text-ink"
                  )}
                  onPressedChange={(pressed) => {
                    onSelectFile(pressed ? item.id : null);
                  }}
                  pressed={isSelected}
                >
                  {item.ocrStatus === "failed" ? (
                    <AlertCircle data-icon="inline-start" />
                  ) : (
                    <FileText data-icon="inline-start" />
                  )}
                  <span className="truncate">{item.file.name}</span>
                </Toggle>
                <div className="flex size-6 items-center justify-end overflow-hidden">
                  <Button
                    aria-label={`Delete ${item.file.name}`}
                    className={cn(
                      "size-6 rounded-none border-0 bg-transparent p-0 text-paper hover:!bg-transparent hover:!text-paper",
                      isSelected &&
                        "text-ink hover:!bg-transparent hover:!text-ink"
                    )}
                    onClick={() => onDeleteFile(item.id)}
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
  );
}
