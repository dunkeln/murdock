"use client";

import * as React from "react";

import { PdfViewer } from "@/components/app/pdf-viewer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ReviewItemSourceModalSource = {
  fileName: string;
  id: string;
  pageLabels: string[];
  sourceUrl: string | null;
};

type ReviewItemSourcesModalProps = {
  className?: string;
  sources: ReviewItemSourceModalSource[];
  triggerClassName?: string;
};

function sourceLabel(source: ReviewItemSourceModalSource) {
  if (source.pageLabels.length === 0) {
    return source.fileName;
  }

  return `${source.fileName} · ${source.pageLabels.join(", ")}`;
}

export function ReviewItemSourcesModal({
  className,
  sources,
  triggerClassName,
}: ReviewItemSourcesModalProps) {
  const [selectedSourceId, setSelectedSourceId] = React.useState(
    sources[0]?.id ?? "",
  );
  const selectedSource =
    sources.find((source) => source.id === selectedSourceId) ??
    sources[0] ??
    null;

  if (sources.length === 0) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className={cn(
            "h-auto rounded-none border-0 bg-transparent px-0 py-0 text-xs text-paper/45 underline underline-offset-2 shadow-none hover:bg-transparent hover:text-paper",
            triggerClassName,
          )}
          type="button"
          variant="ghost"
        >
          Sources
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "flex h-[min(82vh,52rem)] max-w-[min(92vw,64rem)] flex-col gap-0 rounded-none border border-paper/15 bg-ink p-0 text-paper shadow-none sm:max-w-[min(92vw,64rem)]",
          className,
        )}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Sources</DialogTitle>
        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-h-0 overflow-hidden bg-black/20">
            {selectedSource?.sourceUrl ? (
              <PdfViewer
                file={null}
                label={selectedSource.fileName}
                sourceUrl={selectedSource.sourceUrl}
              />
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center px-4 text-center text-sm text-paper/55">
                {selectedSource?.fileName}
              </div>
            )}
          </div>
          <div className="min-h-0 p-2">
            <div className="grid gap-1">
              {sources.map((source) => {
                const isSelected = source.id === selectedSource?.id;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={cn(
                      "min-w-0 px-2 py-2 text-left text-sm leading-5 transition-colors",
                      isSelected
                        ? "bg-paper/10 text-paper"
                        : "text-paper/60 hover:bg-paper/5 hover:text-paper",
                    )}
                    key={source.id}
                    onClick={() => setSelectedSourceId(source.id)}
                    title={sourceLabel(source)}
                    type="button"
                  >
                    <span className="block truncate">{source.fileName}</span>
                    {source.pageLabels.length > 0 ? (
                      <span className="block truncate text-xs text-current/55">
                        {source.pageLabels.join(", ")}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
