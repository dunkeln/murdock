"use client";

import { AlertTriangle, CheckCircle2, FileSearch, Loader2 } from "lucide-react";
import * as React from "react";

import { useIngestedFiles } from "@/components/app/ingested-files-context";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  CaseControlDto,
  CaseControlItemDto,
  CaseControlReadiness,
  CaseControlRole,
} from "@/lib/case-control";
import { cn } from "@/lib/utils";

import { CaseInlineSource, CaseSourceRefs } from "./case-source-refs";

type CaseControlPanelProps = {
  activeItemId?: string | null;
  className?: string;
  control: CaseControlDto;
  onActiveItemChange?: (itemId: string) => void;
};

type RuntimeControl = CaseControlDto & {
  runtimeDetail: string;
  runtimeMessage: string;
  runtimeReadiness: CaseControlReadiness;
};

function isReadyStatus(status: string | undefined) {
  return status === "ready" || status === "needs_review";
}

function runtimeControl(
  control: CaseControlDto,
  intake: ReturnType<typeof useIngestedFiles>,
): RuntimeControl {
  const checkedFiles = intake.files.filter((file) =>
    intake.checkedFileIds.includes(file.id),
  );
  const failedFile = checkedFiles.find(
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
        "Review source",
      runtimeMessage: "Review source",
      runtimeReadiness: "needs_review",
    };
  }

  if (
    !control.activeItem &&
    checkedFiles.some((file) => !isReadyStatus(file.shapingStatus))
  ) {
    return {
      ...control,
      activeItem: null,
      queue: [],
      runtimeDetail: "Reading",
      runtimeMessage: "Reading",
      runtimeReadiness: "preparing",
    };
  }

  if (intake.selectedFile && control.readiness === "empty") {
    return {
      ...control,
      activeItem: null,
      queue: [],
      runtimeDetail: "Source ready",
      runtimeMessage: "Source ready",
      runtimeReadiness: "source_ready",
    };
  }

  return {
    ...control,
    runtimeDetail: control.primaryDetail,
    runtimeMessage: control.primaryMessage,
    runtimeReadiness: control.readiness,
  };
}

function readinessIcon(readiness: CaseControlReadiness) {
  if (readiness === "preparing") {
    return <Loader2 aria-hidden="true" className="animate-spin" />;
  }

  if (readiness === "ready") {
    return <CheckCircle2 aria-hidden="true" />;
  }

  if (readiness === "needs_review") {
    return <AlertTriangle aria-hidden="true" />;
  }

  return <FileSearch aria-hidden="true" />;
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

function roleLabel(role: CaseControlRole) {
  if (role === "legal_ops") {
    return "Legal ops";
  }

  if (role === "lawyer") {
    return "Lawyer";
  }

  if (role === "paralegal") {
    return "Paralegal";
  }

  return null;
}

function readinessLabel(readiness: CaseControlReadiness) {
  if (readiness === "preparing") {
    return "Reading";
  }

  if (readiness === "ready") {
    return "Ready";
  }

  if (readiness === "source_ready") {
    return "Source ready";
  }

  if (readiness === "needs_review") {
    return "Review";
  }

  return "Source";
}

function FindingMeta({ item }: { item: CaseControlItemDto }) {
  const assignedRoleLabel = roleLabel(item.assignedRole);

  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge className="rounded-none font-heading uppercase" variant="outline">
        {item.actionLabel}
      </Badge>
      {assignedRoleLabel ? (
        <Badge className="rounded-none font-heading uppercase" variant="secondary">
          {assignedRoleLabel}
        </Badge>
      ) : null}
      {item.blocking ? (
        <Badge className="rounded-none font-heading uppercase" variant="destructive">
          Blocking
        </Badge>
      ) : null}
    </div>
  );
}

export function CaseControlPanel({
  activeItemId,
  className,
  control,
  onActiveItemChange,
}: CaseControlPanelProps) {
  const intake = useIngestedFiles();
  const liveControl = runtimeControl(control, intake);
  const findingItems = liveControl.queue;
  const resolvedActiveItemId = findingItems.some((item) => item.id === activeItemId)
    ? activeItemId
    : findingItems[0]?.id ?? null;
  const activeItemRef = React.useRef<HTMLElement | null>(null);
  const showRuntimeDetail = findingItems.length === 0;
  const emptyText = emptyCopy(liveControl.runtimeReadiness);
  const showBody = Boolean(findingItems.length > 0 || emptyText);

  React.useEffect(() => {
    if (!resolvedActiveItemId) {
      return;
    }

    activeItemRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
    activeItemRef.current?.focus({ preventScroll: true });
  }, [resolvedActiveItemId]);

  return (
    <aside
      aria-label="Case attention"
      className={cn(
        "flex min-w-0 max-w-full flex-col overflow-hidden border-l border-border/70 bg-transparent xl:min-h-0",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="text-muted-foreground">
            {readinessIcon(liveControl.runtimeReadiness)}
          </div>
          <h2 className="truncate text-sm font-medium leading-tight">
            {liveControl.runtimeMessage}
          </h2>
        </div>
        <Badge className="rounded-none font-heading uppercase" variant="outline">
          {readinessLabel(liveControl.runtimeReadiness)}
        </Badge>
      </div>
      {showRuntimeDetail && liveControl.runtimeDetail !== liveControl.runtimeMessage ? (
        <p className="px-4 pb-3 text-sm leading-6 text-muted-foreground">
          {liveControl.runtimeDetail}
        </p>
      ) : null}

      {showBody ? (
        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:snap-y [&_[data-slot=scroll-area-viewport]]:snap-mandatory">
          <div className="flex flex-col gap-3 px-4 pb-4">
            {findingItems.length > 0 ? (
              findingItems.map((item, index) => {
                const isActive = item.id === resolvedActiveItemId;

                return (
                  <article
                    aria-label={`Finding: ${item.title}`}
                    className={cn(
                      "snap-start border-l py-2 pl-3 pr-2 outline-none",
                      isActive
                        ? "border-paper"
                        : "border-border/60 text-muted-foreground",
                    )}
                    data-active={isActive}
                    data-case-finding={item.id}
                    key={item.id}
                    ref={isActive ? activeItemRef : undefined}
                    tabIndex={-1}
                  >
                    <div className="flex min-w-0 flex-col gap-3">
                      <button
                        aria-label={`Show finding ${index + 1}: ${item.title}`}
                        aria-pressed={isActive}
                        className="flex min-w-0 items-start gap-2 text-left"
                        onClick={() => onActiveItemChange?.(item.id)}
                        type="button"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-5 shrink-0 items-center justify-center border border-border/70 text-[0.625rem] leading-none",
                            isActive && "border-paper bg-paper text-ink",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug text-foreground">
                            {item.title}
                          </span>
                          {isActive ? (
                            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                              {item.summary}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <FindingMeta item={item} />
                      {isActive ? (
                        <>
                          <CaseInlineSource item={item} />
                          <CaseSourceRefs item={item} />
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">{emptyText}</p>
            )}
          </div>
        </ScrollArea>
      ) : null}
    </aside>
  );
}
