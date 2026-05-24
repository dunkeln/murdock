"use client";

import { Eye, FileText, Trash2 } from "lucide-react";

import type { IngestedFileItem } from "@/components/app/ingested-file-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type IngestedFilesListProps = {
  checkedFileIds: string[];
  files: IngestedFileItem[];
  onCheckedFileIdsChange: (fileIds: string[]) => void;
  onDeleteFile: (fileId: string) => void;
  onSelectFile: (fileId: string) => void;
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
    <section className="flex w-full max-w-md justify-self-end flex-col gap-2 text-sm text-paper/70">
      <p className="text-xs font-medium uppercase tracking-wide text-paper/45">
        Ingested files
      </p>
      <ol className="flex max-h-[13.5rem] flex-col gap-2 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {files.map((item) => {
          const isSelected = selectedFileId === item.id;
          const isChecked = checkedFileIds.includes(item.id);

          return (
            <li key={item.id}>
              <div
                className={cn(
                  "flex h-9 items-center gap-2 border border-paper/15 px-2 text-paper transition-colors hover:bg-paper/10",
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
                <Button
                  aria-pressed={isSelected}
                  className={cn(
                    "min-w-0 flex-1 justify-start overflow-hidden rounded-none border-0 bg-transparent px-1 text-paper hover:!bg-transparent hover:!text-paper",
                    isSelected && "text-ink hover:!bg-transparent hover:!text-ink"
                  )}
                  onClick={() => onSelectFile(item.id)}
                  type="button"
                  variant="ghost"
                >
                  <FileText data-icon="inline-start" />
                  <span className="truncate">{item.file.name}</span>
                </Button>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label={`View ${item.file.name}`}
                    className={cn(
                      "rounded-none border-0 bg-transparent text-paper hover:!bg-transparent hover:!text-paper",
                      isSelected &&
                        "text-ink hover:!bg-transparent hover:!text-ink"
                    )}
                    onClick={() => onSelectFile(item.id)}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <Eye data-icon="inline-start" />
                  </Button>
                  <Button
                    aria-label={`Delete ${item.file.name}`}
                    className={cn(
                      "rounded-none border-0 bg-transparent text-paper hover:!bg-transparent hover:!text-paper",
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
