"use client";

import * as React from "react";

import { useIngestedFiles } from "@/components/app/ingested-files-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  CaseControlDto,
  CaseControlReadiness,
} from "@/lib/case-control";
import { cn } from "@/lib/utils";

type CaseControlPanelProps = {
  activeReviewItemId?: string | null;
  className?: string;
  control: CaseControlDto;
  onActiveReviewItemChange?: (itemId: string) => void;
  variant?: "rail" | "overlay";
};

type RuntimeControl = CaseControlDto & {
  runtimeDetail: string;
  runtimeReadiness: CaseControlReadiness;
};

function isReadyStatus(status: string | undefined) {
  return status === "ready" || status === "needs_review";
}

function runtimeControl(
  control: CaseControlDto,
  intake: ReturnType<typeof useIngestedFiles>,
): RuntimeControl {
  const includedFiles = intake.files.filter((file) =>
    intake.includedFileIds.includes(file.id),
  );
  const failedFile = includedFiles.find(
    (file) => file.ocrStatus === "failed" || file.shapingStatus === "failed",
  );

  if (failedFile) {
    return {
      ...control,
      activeItem: null,
      queue: [],
      runtimeDetail:
        failedFile.errorMessage ??
        failedFile.shapingErrorMessage ??
        "Source issue",
      runtimeReadiness: "needs_review",
    };
  }

  if (
    !control.activeItem &&
    includedFiles.some((file) => !isReadyStatus(file.shapingStatus))
  ) {
    return {
      ...control,
      activeItem: null,
      queue: [],
      runtimeDetail: "Reading source",
      runtimeReadiness: "preparing",
    };
  }

  if (intake.previewedFile && control.readiness === "empty") {
    return {
      ...control,
      activeItem: null,
      queue: [],
      runtimeDetail: "Source ready",
      runtimeReadiness: "source_ready",
    };
  }

  return {
    ...control,
    runtimeDetail: control.primaryDetail,
    runtimeReadiness: control.readiness,
  };
}

function emptyCopy(readiness: CaseControlReadiness) {
  if (readiness === "preparing") {
    return null;
  }

  if (readiness === "source_ready") {
    return null;
  }

  if (readiness === "ready") {
    return "Ready";
  }

  return null;
}

export function CaseControlPanel({
  activeReviewItemId,
  className,
  control,
  onActiveReviewItemChange,
  variant = "rail",
}: CaseControlPanelProps) {
  const intake = useIngestedFiles();
  const liveControl = runtimeControl(control, intake);
  const findingItems = liveControl.queue;
  const resolvedActiveReviewItemId = findingItems.some(
    (item) => item.id === activeReviewItemId,
  )
    ? activeReviewItemId
    : findingItems[0]?.id ?? null;
  const activeItemRef = React.useRef<HTMLElement | null>(null);
  const showRuntimeDetail =
    findingItems.length === 0 && Boolean(liveControl.runtimeDetail);
  const emptyText = emptyCopy(liveControl.runtimeReadiness);
  const showBody = Boolean(findingItems.length > 0 || showRuntimeDetail || emptyText);
  const isOverlay = variant === "overlay";

  React.useEffect(() => {
    if (isOverlay || !resolvedActiveReviewItemId) {
      return;
    }

    activeItemRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
    activeItemRef.current?.focus({ preventScroll: true });
  }, [isOverlay, resolvedActiveReviewItemId]);

  return (
    <aside
      aria-label="Case attention"
      className={cn(
        "flex min-w-0 max-w-full flex-col overflow-hidden bg-transparent xl:min-h-0",
        isOverlay ? "h-full border-0" : "border-l border-border/70",
        className,
      )}
    >
      {showBody ? (
        <ScrollArea
          className={cn(
            "min-h-0 flex-1",
            isOverlay && "[&_[data-slot=scroll-area-scrollbar]]:hidden",
          )}
        >
          <div
            className={cn(
              "flex flex-col",
              isOverlay ? "gap-2" : "gap-3 px-4 py-4",
            )}
          >
            {findingItems.length > 0 ? (
              findingItems.map((item, index) => {
                const isActive = item.id === resolvedActiveReviewItemId;

                return (
                  <article
                    aria-label={`Finding: ${item.title}`}
                    className={cn(
                      "bg-ink outline-none transition-colors",
                      isOverlay && isActive &&
                        "text-paper",
                      isOverlay && !isActive &&
                        "text-paper/60 hover:bg-ink hover:text-paper/85",
                      !isOverlay && isActive &&
                        "bg-paper/10 text-paper",
                      !isOverlay && !isActive &&
                        "text-paper/65 hover:bg-paper/5 hover:text-paper",
                    )}
                    data-active={isActive}
                    data-case-finding={item.id}
                    key={item.id}
                    ref={isActive ? activeItemRef : undefined}
                    tabIndex={-1}
                  >
                    <button
                      aria-label={`Show finding ${index + 1}: ${item.title}`}
                      aria-pressed={isActive}
                      className={cn(
                        "flex w-full min-w-0 flex-col text-left",
                        isOverlay ? "gap-2 p-2.5" : "gap-2.5 p-3",
                      )}
                      onClick={() => onActiveReviewItemChange?.(item.id)}
                      type="button"
                    >
                      <span className="flex min-w-0 items-start gap-2">
                        <span
                          className={cn(
                            "mt-0.5 flex shrink-0 items-center justify-center bg-paper/10 font-heading leading-none text-current/60",
                            isOverlay
                              ? "size-4 text-[0.625rem]"
                              : "size-5 text-[0.6875rem]",
                            isActive && "bg-paper text-ink",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block font-heading uppercase leading-tight text-current",
                              isOverlay ? "text-sm" : "text-base",
                            )}
                          >
                            {item.title}
                          </span>
                          {isActive ? (
                            <span
                              className={cn(
                                "mt-1 block text-current/65",
                                isOverlay ? "text-xs leading-5" : "text-sm leading-6",
                              )}
                            >
                              {item.summary}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </article>
                );
              })
            ) : showRuntimeDetail ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {liveControl.runtimeDetail}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{emptyText}</p>
            )}
          </div>
        </ScrollArea>
      ) : null}
    </aside>
  );
}
