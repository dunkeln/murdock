"use client";

import * as React from "react";
import { Circle, CircleCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import type { CaseControlDto } from "@/lib/case-control";
import type { CaseWorkspaceSourceDocumentDto } from "@/lib/contracts/case-workspace";
import {
  getCaseActionQueueOutputSchema,
  getRoiReviewPlanOutputSchema,
  mcpCaseActionTaskSchema,
} from "@/lib/contracts/mcp";
import { cn } from "@/lib/utils";

import {
  ReviewItemSourcesModal,
  type ReviewItemSourceModalSource,
} from "./review-item-sources-modal";

type ReviewActionPipelineProps = {
  activeReviewItemId?: string | null;
  className?: string;
  control: CaseControlDto;
  onActiveReviewItemChange?: (itemId: string | null) => void;
  onActionQueueCountChange?: (count: number) => void;
  seededPlan?: ReviewerPlanResponse;
  sourceDocuments?: ReviewActionSourceDocument[];
};

type ReviewActionTriggerProps = React.ComponentProps<"button"> & {
  className?: string;
  queuedCount?: number;
};

const reviewerPlanResponseSchema = getRoiReviewPlanOutputSchema.extend({
  itemIdsByReviewRef: z.record(z.string().min(1), z.string().min(1)),
});
const queueActionResponseSchema = z.object({
  queue: getCaseActionQueueOutputSchema,
  task: mcpCaseActionTaskSchema,
});

export type ReviewerPlanResponse = z.infer<typeof reviewerPlanResponseSchema>;
type ReviewerPlanChoice = ReviewerPlanResponse["choices"][number];
type ActiveReviewItem = NonNullable<CaseControlDto["activeItem"]>;
type CaseActionQueueSnapshot = z.infer<typeof getCaseActionQueueOutputSchema>;
type ReviewActionSourceDocument = Pick<
  CaseWorkspaceSourceDocumentDto,
  "caseDocumentId" | "fileName" | "id" | "title"
>;

const actionQueueSyncChannelName = "murdock:case-action-queue-sync";
const actionQueueSyncStorageKey = "murdock:case-action-queue-sync";

type ActionQueueSyncMessage = {
  caseId: string;
  revision: string;
};

function isActionQueueSyncMessage(value: unknown): value is ActionQueueSyncMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ActionQueueSyncMessage>;

  return (
    typeof candidate.caseId === "string" &&
    candidate.caseId.length > 0 &&
    typeof candidate.revision === "string" &&
    candidate.revision.length > 0
  );
}

function nextActionQueueRevision() {
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function publishCaseActionQueueSync(caseId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const message: ActionQueueSyncMessage = {
    caseId,
    revision: nextActionQueueRevision(),
  };

  try {
    const channel = new BroadcastChannel(actionQueueSyncChannelName);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel may be unavailable in constrained browser contexts.
  }

  try {
    window.localStorage.setItem(actionQueueSyncStorageKey, JSON.stringify(message));
  } catch {
    // Storage events are a best-effort fallback for cross-window refresh.
  }
}

export function subscribeCaseActionQueueSync(
  caseId: string,
  onSync: () => void,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  let channel: BroadcastChannel | null = null;

  function handleMessageData(data: unknown) {
    if (isActionQueueSyncMessage(data) && data.caseId === caseId) {
      onSync();
    }
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== actionQueueSyncStorageKey || !event.newValue) {
      return;
    }

    try {
      handleMessageData(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed sync payloads from older app versions.
    }
  }

  function handleFocus() {
    onSync();
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      onSync();
    }
  }

  try {
    channel = new BroadcastChannel(actionQueueSyncChannelName);
    channel.addEventListener("message", (event) => handleMessageData(event.data));
  } catch {
    channel = null;
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    channel?.close();
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener("focus", handleFocus);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

function activeItemFor(
  control: CaseControlDto,
  activeReviewItemId: string | null | undefined,
) {
  if (!activeReviewItemId) {
    return control.activeItem;
  }

  return control.queue.find((item) => item.id === activeReviewItemId) ?? null;
}

function affectedItemIds(
  choice: ReviewerPlanChoice,
  plan: ReviewerPlanResponse | null,
) {
  return choice.affectedReviewRefs.flatMap((reviewRef) => {
    const itemId = plan?.itemIdsByReviewRef[reviewRef];

    return itemId ? [itemId] : [];
  });
}

function choicesForItem(
  itemId: string,
  plan: ReviewerPlanResponse | null,
) {
  return plan?.choices.filter((choice) =>
    affectedItemIds(choice, plan).includes(itemId),
  ) ?? [];
}

function reviewRefForItem(
  itemId: string,
  plan: ReviewerPlanResponse | null,
) {
  if (!plan) {
    return null;
  }

  return (
    Object.entries(plan.itemIdsByReviewRef).find(
      ([, mappedItemId]) => mappedItemId === itemId,
    )?.[0] ?? null
  );
}

function activeQueuedReviewRefs(queue: CaseActionQueueSnapshot | null) {
  const refs = new Set<string>();

  for (const task of queue?.tasks ?? []) {
    if (task.status === "done" || task.status === "dismissed") {
      continue;
    }

    for (const reviewRef of task.sourceReviewRefs) {
      refs.add(reviewRef);
    }
  }

  return refs;
}

function renderedChoiceKey(input: {
  choiceId: string;
  itemId: string;
}) {
  return `${input.itemId}:${input.choiceId}`;
}

function displayActionText(value: string) {
  return value.replaceAll("case team review", "review");
}

const queuedActionGridStyle = {
  display: "grid",
  gap: "0.375rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 26rem), 1fr))",
  width: "100%",
} satisfies React.CSSProperties;

const queuedActionCardStyle = {
  gridTemplateColumns: "auto minmax(0, 1fr) auto",
  minHeight: "2.125rem",
} satisfies React.CSSProperties;

function sourceModalSourcesForItem(
  item: ActiveReviewItem,
  sourceDocuments: ReviewActionSourceDocument[],
): ReviewItemSourceModalSource[] {
  const documentById = new Map(
    sourceDocuments.map((document) => [document.id, document]),
  );
  const sourcesByDocumentId = new Map<string, ReviewItemSourceModalSource>();

  for (const sourceRef of item.sourceRefs) {
    const sourceDocument = documentById.get(sourceRef.docId);
    const existingSource = sourcesByDocumentId.get(sourceRef.docId);
    const pageLabel = sourceRef.page ? `p. ${sourceRef.page}` : null;

    if (existingSource) {
      if (pageLabel && !existingSource.pageLabels.includes(pageLabel)) {
        existingSource.pageLabels.push(pageLabel);
      }

      continue;
    }

    sourcesByDocumentId.set(sourceRef.docId, {
      fileName: sourceDocument?.fileName ?? sourceRef.fileName,
      id: sourceRef.docId,
      pageLabels: pageLabel ? [pageLabel] : [],
      sourceUrl: sourceDocument?.caseDocumentId
        ? `/case-documents/${sourceDocument.caseDocumentId}`
        : null,
    });
  }

  return Array.from(sourcesByDocumentId.values());
}

function StageCard({
  choice,
  index,
  isSelected,
}: {
  choice: ReviewerPlanChoice;
  index: number;
  isSelected: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center gap-3 overflow-hidden border border-transparent px-3 py-1.5 text-left transition-colors",
        isSelected
          ? "border-paper/35 bg-paper/10 text-paper"
          : "text-paper hover:border-paper/25 hover:bg-paper/5",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center border border-paper/15 text-[11px] leading-none text-paper/55">
        {index + 1}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span className="block truncate text-sm leading-5">
          {displayActionText(choice.label)}
        </span>
        {choice.tone === "recommended" ? (
          <span className="hidden shrink-0 text-xs leading-none text-paper/50 sm:inline">
            Recommended
          </span>
        ) : null}
      </span>
    </div>
  );
}

function IssueContext({
  item,
  sources,
}: {
  item: ActiveReviewItem;
  sources: ReviewItemSourceModalSource[];
}) {
  return (
    <div className="px-0 text-paper">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="block min-w-0 truncate text-sm font-medium leading-5">
          {item.title}
        </span>
        <ReviewItemSourcesModal
          sources={sources}
          triggerClassName="shrink-0"
        />
      </div>
      <span className="mt-1 block truncate text-xs italic leading-5 text-paper/65">
        {item.summary}
      </span>
    </div>
  );
}

async function loadReviewerPlan(input: {
  activeItemId: string | null;
  caseId: string;
}) {
  const response = await fetch(`/api/cases/${input.caseId}/reviewer-plan`, {
    body: JSON.stringify({ activeItemId: input.activeItemId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Reviewer planner failed.",
    );
  }

  return reviewerPlanResponseSchema.parse(data);
}

async function loadActionQueue(caseId: string) {
  const response = await fetch(`/api/cases/${caseId}/reviewer-plan/action`, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    method: "GET",
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Action queue snapshot failed.",
    );
  }

  return getCaseActionQueueOutputSchema.parse(data);
}

async function queueReviewerAction(input: {
  body: Record<string, unknown>;
  caseId: string;
}) {
  const response = await fetch(`/api/cases/${input.caseId}/reviewer-plan/action`, {
    body: JSON.stringify(input.body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Reviewer action queue failed.",
    );
  }

  return queueActionResponseSchema.parse(data);
}

function ActionQueueSnapshot({
  onDismissTask,
  queue,
  updatingTaskKey,
}: {
  onDismissTask: (taskKey: string) => void;
  queue: CaseActionQueueSnapshot | null;
  updatingTaskKey: string;
}) {
  const tasks = queue?.tasks ?? [];

  if (tasks.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Queued action items"
      className="min-h-0 w-full overflow-y-auto pr-1 text-paper [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div style={queuedActionGridStyle}>
        {tasks.map((task) => {
          const isReconciled =
            task.status === "done" || task.status === "dismissed";
          const StatusIcon = isReconciled ? CircleCheck : Circle;
          const displayTitle = displayActionText(task.title);
          const fullTaskText =
            task.description && task.description !== task.title
              ? `${displayTitle}: ${task.description}`
              : displayTitle;

          return (
            <div
              aria-label={fullTaskText}
              className="group grid min-w-0 items-center gap-2 overflow-hidden rounded-sm border border-paper/12 bg-paper/[0.055] px-2.5 py-1 text-xs leading-4 text-paper/75 transition-colors hover:border-paper/25 hover:bg-paper/10"
              key={task.taskRef}
              style={queuedActionCardStyle}
              title={fullTaskText}
            >
              <StatusIcon
                aria-hidden
                className={cn(
                  "size-4",
                  isReconciled ? "text-paper/65" : "text-paper/40",
                )}
                strokeWidth={1.5}
              />
              <span
                className={cn(
                  "min-w-0 truncate",
                  isReconciled &&
                    "text-paper/45 line-through decoration-paper/25",
                )}
              >
                {displayTitle}
              </span>
              <button
                aria-label={`Undo ${fullTaskText}`}
                className="flex size-5 shrink-0 items-center justify-center rounded-sm text-paper/45 opacity-0 transition hover:bg-paper/10 hover:text-paper focus-visible:opacity-100 disabled:opacity-45 group-hover:opacity-100"
                disabled={updatingTaskKey === task.taskKey}
                onClick={() => onDismissTask(task.taskKey)}
                title="Undo"
                type="button"
              >
                <Undo2 aria-hidden className="size-3" strokeWidth={1.7} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReviewItemCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="grid w-full min-w-0 max-w-full gap-3 overflow-hidden border border-paper/15 bg-paper/[0.018] px-4 py-3 sm:px-5 sm:py-4">
      {children}
    </section>
  );
}

export function ReviewActionTrigger({
  className,
  queuedCount = 0,
  ...props
}: ReviewActionTriggerProps) {
  const label =
    queuedCount > 0 ? `Action Items (${queuedCount} tasks)` : "Action Items";

  return (
    <Button
      aria-label={label}
      className={cn(
        "hover-theme-invert relative h-9 w-fit justify-center rounded-none border-paper/15 bg-ink px-2.5 font-heading text-sm uppercase text-paper",
        className,
      )}
      type="button"
      variant="outline"
      {...props}
    >
      Action Items
      {queuedCount > 0 ? (
        <span
          aria-hidden
          className="absolute -left-1 -top-1 flex size-2.5"
        >
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-paper/60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-paper" />
        </span>
      ) : null}
    </Button>
  );
}

export function ReviewActionContent({
  activeReviewItemId,
  className,
  control,
  onActiveReviewItemChange,
  onActionQueueCountChange,
  seededPlan,
  sourceDocuments = [],
}: ReviewActionPipelineProps) {
  const activeItem = activeItemFor(control, activeReviewItemId);
  const [plan, setPlan] = React.useState<ReviewerPlanResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [queueSnapshot, setQueueSnapshot] =
    React.useState<CaseActionQueueSnapshot | null>(null);
  const [queueError, setQueueError] = React.useState<string | null>(null);
  const [queueingKey, setQueueingKey] = React.useState<string>("");
  const [queueRevision, setQueueRevision] = React.useState(0);
  const [updatingTaskKey, setUpdatingTaskKey] = React.useState<string>("");
  const effectivePlan = seededPlan ?? plan;
  const [selectedChoiceKey, setSelectedChoiceKey] = React.useState<string>("");
  const [customChoiceByItemId, setCustomChoiceByItemId] = React.useState<
    Record<string, string>
  >({});
  const queuedReviewRefs = React.useMemo(
    () => activeQueuedReviewRefs(queueSnapshot),
    [queueSnapshot],
  );
  const reviewItems = React.useMemo(() => {
    if (!effectivePlan?.choices.length) {
      return [];
    }

    return control.queue.flatMap((item) => {
      const reviewRef = reviewRefForItem(item.id, effectivePlan);

      if (reviewRef && queuedReviewRefs.has(reviewRef)) {
        return [];
      }

      const choices = choicesForItem(item.id, effectivePlan);

      return choices.length > 0 ? [{ choices, item }] : [];
    });
  }, [control.queue, effectivePlan, queuedReviewRefs]);
  const shouldShowReviewPane = Boolean(
    error || queueError || isLoading || reviewItems.length > 0,
  );
  const refreshActionQueue = React.useCallback(async () => {
    if (seededPlan) {
      return;
    }

    try {
      const snapshot = await loadActionQueue(control.case.id);

      setQueueSnapshot(snapshot);
      setQueueRevision((current) => current + 1);
      onActionQueueCountChange?.(snapshot.tasks.length);
      setQueueError(null);
    } catch (loadError) {
      setQueueError(
        loadError instanceof Error
          ? loadError.message
          : "Action queue snapshot failed.",
      );
    }
  }, [control.case.id, onActionQueueCountChange, seededPlan]);

  React.useEffect(() => {
    if (seededPlan) {
      return;
    }

    if (control.queue.length === 0) {
      return;
    }

    let cancelled = false;

    async function refresh() {
      setIsLoading(true);
      setError(null);

      try {
        const nextPlan = await loadReviewerPlan({
          activeItemId: activeItem?.id ?? null,
          caseId: control.case.id,
        });

        if (!cancelled) {
          setPlan(nextPlan);
        }
      } catch (planError) {
        if (!cancelled) {
          setError(
            planError instanceof Error
              ? planError.message
              : "Reviewer planner failed.",
          );
          setPlan(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void refresh();

    return () => {
      cancelled = true;
    };
  }, [activeItem?.id, control.case.id, control.queue.length, queueRevision, seededPlan]);

  React.useEffect(() => {
    let cancelled = false;

    async function refreshQueue() {
      if (seededPlan) {
        return;
      }

      try {
        const snapshot = await loadActionQueue(control.case.id);

        if (!cancelled) {
          setQueueSnapshot(snapshot);
          setQueueRevision((current) => current + 1);
          onActionQueueCountChange?.(snapshot.tasks.length);
          setQueueError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setQueueError(
            loadError instanceof Error
              ? loadError.message
              : "Action queue snapshot failed.",
          );
        }
      }
    }

    void refreshQueue();

    return () => {
      cancelled = true;
    };
  }, [control.case.id, onActionQueueCountChange, seededPlan]);

  React.useEffect(() => {
    if (seededPlan) {
      return;
    }

    return subscribeCaseActionQueueSync(control.case.id, () => {
      void refreshActionQueue();
    });
  }, [control.case.id, refreshActionQueue, seededPlan]);

  async function selectChoice(choice: ReviewerPlanChoice, item: ActiveReviewItem) {
    const choiceKey = renderedChoiceKey({
      choiceId: choice.id,
      itemId: item.id,
    });

    setSelectedChoiceKey(choiceKey);
    onActiveReviewItemChange?.(item.id);

    if (seededPlan) {
      toast("Action queued", {
        description: `${choice.label} was added to the case action queue.`,
      });
      return;
    }

    setQueueingKey(choiceKey);

    try {
      const result = await queueReviewerAction({
        body: {
          choiceRef: choice.choiceRef,
          itemId: item.id,
          mode: "choice",
        },
        caseId: control.case.id,
      });

      setQueueSnapshot(result.queue);
      setQueueRevision((current) => current + 1);
      onActionQueueCountChange?.(result.queue.tasks.length);
      setQueueError(null);
      publishCaseActionQueueSync(control.case.id);
      toast("Action queued", {
        description: `${result.task.title} was added to the case action queue.`,
      });
    } catch (queueErrorResult) {
      setQueueError(
        queueErrorResult instanceof Error
          ? queueErrorResult.message
          : "Reviewer action queue failed.",
      );
      toast("Action queue failed", {
        description:
          queueErrorResult instanceof Error
            ? queueErrorResult.message
            : "Reviewer action queue failed.",
      });
    } finally {
      setQueueingKey("");
    }
  }

  async function requestCustomChoice(item: ActiveReviewItem) {
    const customChoice = customChoiceByItemId[item.id]?.trim();

    if (!customChoice) {
      return;
    }

    const choiceKey = renderedChoiceKey({
      choiceId: "custom",
      itemId: item.id,
    });

    setSelectedChoiceKey(choiceKey);
    onActiveReviewItemChange?.(item.id);

    if (seededPlan) {
      toast("Custom action queued", {
        description: `${customChoice} was added to the case action queue.`,
      });
      return;
    }

    setQueueingKey(choiceKey);

    try {
      const result = await queueReviewerAction({
        body: {
          customStep: customChoice,
          itemId: item.id,
          mode: "custom",
        },
        caseId: control.case.id,
      });

      setQueueSnapshot(result.queue);
      setQueueRevision((current) => current + 1);
      onActionQueueCountChange?.(result.queue.tasks.length);
      setQueueError(null);
      setCustomChoiceByItemId((current) => ({
        ...current,
        [item.id]: "",
      }));
      publishCaseActionQueueSync(control.case.id);
      toast("Custom action queued", {
        description: `${result.task.title} was added to the case action queue.`,
      });
    } catch (queueErrorResult) {
      setQueueError(
        queueErrorResult instanceof Error
          ? queueErrorResult.message
          : "Reviewer action queue failed.",
      );
      toast("Action queue failed", {
        description:
          queueErrorResult instanceof Error
            ? queueErrorResult.message
            : "Reviewer action queue failed.",
      });
    } finally {
      setQueueingKey("");
    }
  }

  async function ignoreItem(item: ActiveReviewItem) {
    const choiceKey = renderedChoiceKey({
      choiceId: "dismissed",
      itemId: item.id,
    });

    setSelectedChoiceKey(choiceKey);
    onActiveReviewItemChange?.(item.id);

    if (seededPlan) {
      toast("Ignore queued", {
        description: "Dismissal review was added to the case action queue.",
      });
      return;
    }

    setQueueingKey(choiceKey);

    try {
      const result = await queueReviewerAction({
        body: {
          itemId: item.id,
          mode: "ignore",
        },
        caseId: control.case.id,
      });

      setQueueSnapshot(result.queue);
      setQueueRevision((current) => current + 1);
      onActionQueueCountChange?.(result.queue.tasks.length);
      setQueueError(null);
      publishCaseActionQueueSync(control.case.id);
      toast("Ignore queued", {
        description: `${result.task.title} was added to the case action queue.`,
      });
    } catch (queueErrorResult) {
      setQueueError(
        queueErrorResult instanceof Error
          ? queueErrorResult.message
          : "Reviewer action queue failed.",
      );
      toast("Action queue failed", {
        description:
          queueErrorResult instanceof Error
            ? queueErrorResult.message
            : "Reviewer action queue failed.",
      });
    } finally {
      setQueueingKey("");
    }
  }

  async function dismissTask(taskKey: string) {
    if (seededPlan) {
      setQueueSnapshot((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.filter((task) => task.taskKey !== taskKey),
            }
          : current,
      );
      return;
    }

    setUpdatingTaskKey(taskKey);

    try {
      const result = await queueReviewerAction({
        body: {
          mode: "status",
          status: "dismissed",
          taskKey,
        },
        caseId: control.case.id,
      });

      setQueueSnapshot(result.queue);
      setQueueRevision((current) => current + 1);
      onActionQueueCountChange?.(result.queue.tasks.length);
      setQueueError(null);
      publishCaseActionQueueSync(control.case.id);
    } catch (queueErrorResult) {
      setQueueError(
        queueErrorResult instanceof Error
          ? queueErrorResult.message
          : "Action queue undo failed.",
      );
      toast("Action queue undo failed", {
        description:
          queueErrorResult instanceof Error
            ? queueErrorResult.message
            : "Action queue undo failed.",
      });
    } finally {
      setUpdatingTaskKey("");
    }
  }

  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden text-sm text-paper",
        className,
      )}
    >
      {queueSnapshot?.tasks.length ? (
        <div className="shrink-0 pb-3">
          <ActionQueueSnapshot
            onDismissTask={(taskKey) => void dismissTask(taskKey)}
            queue={queueSnapshot}
            updatingTaskKey={updatingTaskKey}
          />
        </div>
      ) : null}
      {shouldShowReviewPane ? (
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-paper/10 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid gap-3">
          {error ? (
            <div className="border border-paper/15 px-3 py-2 text-xs leading-5 text-paper/65">
              <span>{error}</span>
            </div>
          ) : null}
          {queueError ? (
            <div className="border border-paper/15 px-3 py-2 text-xs leading-5 text-paper/65">
              <span>{queueError}</span>
            </div>
          ) : null}
          {!error && isLoading ? (
            <div className="px-1 py-1 text-xs text-paper/45">
              <span>Planning review boundary</span>
              <span className="ml-1 inline-flex w-5 overflow-hidden align-bottom">
                <span className="animate-pulse">...</span>
              </span>
            </div>
          ) : null}
          {!error && reviewItems.length > 0
            ? reviewItems.map(({ choices: itemChoices, item }) => {
                const itemSources = sourceModalSourcesForItem(
                  item,
                  sourceDocuments,
                );

                return (
                  <ReviewItemCard key={item.id}>
                    <IssueContext item={item} sources={itemSources} />
                    <div className="grid gap-1.5">
                      {itemChoices.map((choice, index) => {
                        const isSelected =
                          renderedChoiceKey({
                            choiceId: choice.id,
                            itemId: item.id,
                          }) === selectedChoiceKey;

                        return (
                          <button
                            aria-label={`Select ${choice.label}`}
                            aria-pressed={isSelected}
                            className="block w-full text-left"
                            data-reviewer-plan-choice={choice.id}
                            data-reviewer-plan-item={item.id}
                            disabled={
                              queueingKey ===
                              renderedChoiceKey({
                                choiceId: choice.id,
                                itemId: item.id,
                              })
                            }
                            key={choice.choiceRef}
                            onClick={() => void selectChoice(choice, item)}
                            type="button"
                          >
                            <StageCard
                              choice={choice}
                              index={index}
                              isSelected={isSelected}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <form
                      className="flex w-full min-w-0 items-stretch gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void requestCustomChoice(item);
                      }}
                    >
                      <input
                        aria-label={`Custom action for ${item.title}`}
                        className="min-h-8 w-0 min-w-0 flex-1 border border-paper/10 bg-transparent px-3 py-1.5 text-sm text-paper outline-none placeholder:text-paper/35 focus:border-paper/45"
                        onChange={(event) =>
                          setCustomChoiceByItemId((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder={`${itemChoices.length + 1}. Describe another step...`}
                        value={customChoiceByItemId[item.id] ?? ""}
                      />
                      <Button
                        className="hover-theme-invert h-8 w-20 shrink-0 rounded-none border-paper/10 bg-ink px-3 text-sm text-paper sm:w-24"
                        disabled={
                          !customChoiceByItemId[item.id]?.trim() ||
                          queueingKey ===
                            renderedChoiceKey({
                              choiceId: "custom",
                              itemId: item.id,
                            })
                        }
                        type="submit"
                        variant="outline"
                      >
                        Queue
                      </Button>
                    </form>
                    <Button
                      className={cn(
                        "h-auto w-fit rounded-none border-0 bg-transparent px-0 py-0 text-xs text-paper/45 shadow-none hover:bg-transparent hover:text-paper",
                        selectedChoiceKey ===
                          renderedChoiceKey({
                            choiceId: "dismissed",
                            itemId: item.id,
                          }) &&
                          "text-paper",
                      )}
                      data-reviewer-plan-event-type="dismissed"
                      disabled={
                        queueingKey ===
                        renderedChoiceKey({
                          choiceId: "dismissed",
                          itemId: item.id,
                        })
                      }
                      onClick={() => void ignoreItem(item)}
                      type="button"
                      variant="ghost"
                    >
                      Ignore
                    </Button>
                  </ReviewItemCard>
                );
              })
            : null}
        </div>
      </div>
      ) : null}
    </section>
  );
}

export function ReviewActionPipeline(props: ReviewActionPipelineProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col text-sm text-paper",
        props.className,
      )}
      data-review-action-pipeline
    >
      <ReviewActionContent
        {...props}
        className="flex min-h-0 flex-1 flex-col"
      />
    </section>
  );
}
