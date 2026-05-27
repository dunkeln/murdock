"use client";

import { FileSearch, Layers3, RotateCcw, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CaseControlDto } from "@/lib/case-control";
import { getRoiReviewPlanOutputSchema } from "@/lib/contracts/mcp";
import { cn } from "@/lib/utils";

type ReviewActionPipelineProps = {
  activeReviewItemId?: string | null;
  className?: string;
  control: CaseControlDto;
  onActiveReviewItemChange?: (itemId: string | null) => void;
  seededPlan?: ReviewerPlanResponse;
};

const reviewerPlanResponseSchema = getRoiReviewPlanOutputSchema.extend({
  itemIdsByReviewRef: z.record(z.string().min(1), z.string().min(1)),
});

export type ReviewerPlanResponse = z.infer<typeof reviewerPlanResponseSchema>;
type ReviewerPlanChoice = ReviewerPlanResponse["choices"][number];

type LocalStage = {
  choiceLabel: string;
  stageState: ReviewerPlanChoice["stageState"];
};

const choiceIcons = {
  cleanup: RotateCcw,
  recommended: Layers3,
  self_start: FileSearch,
} satisfies Record<ReviewerPlanChoice["tone"], LucideIcon>;

const riskLabels = {
  high: "High risk",
  low: "Low risk",
  medium: "Medium risk",
} satisfies Record<ReviewerPlanChoice["risk"], string>;

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

function StageCard({
  choice,
  isSelected,
  itemIds,
}: {
  choice: ReviewerPlanChoice;
  isSelected: boolean;
  itemIds: string[];
}) {
  const Icon = choiceIcons[choice.tone];

  return (
    <div
      className={cn(
        "grid w-full min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-2 overflow-hidden border px-2.5 py-2 text-left transition-colors",
        isSelected
          ? "border-paper bg-paper text-ink"
          : "border-paper/15 text-paper hover:border-paper/45 hover:bg-paper/5",
      )}
    >
      <span className="mt-0.5 grid size-7 place-items-center border border-current/20">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-heading text-xs uppercase leading-4">
          {choice.label}
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-4 opacity-70">
          {choice.rationale}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs leading-4 opacity-55">
        <span className="block tabular-nums">{itemIds.length}</span>
        <span className="block">{riskLabels[choice.risk]}</span>
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

export function ReviewActionPipeline({
  activeReviewItemId,
  className,
  control,
  onActiveReviewItemChange,
  seededPlan,
}: ReviewActionPipelineProps) {
  const activeItem = activeItemFor(control, activeReviewItemId);
  const [plan, setPlan] = React.useState<ReviewerPlanResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [localStages, setLocalStages] = React.useState<Record<string, LocalStage>>({});
  const effectivePlan = seededPlan ?? plan;
  const stagedCount = Object.keys(localStages).length;

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
  }, [activeItem?.id, control.case.id, control.queue.length, seededPlan]);

  function selectChoice(choice: ReviewerPlanChoice) {
    const itemIds = affectedItemIds(choice, effectivePlan);

    setLocalStages((current) => ({
      ...current,
      ...Object.fromEntries(
        itemIds.map((itemId) => [
          itemId,
          {
            choiceLabel: choice.label,
            stageState: choice.stageState,
          },
        ]),
      ),
    }));
    onActiveReviewItemChange?.(itemIds[0] ?? null);
  }

  return (
    <section
      aria-label="Reviewer agent"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden border border-paper/15 bg-ink text-paper",
        className,
      )}
      data-review-action-pipeline
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-paper/15 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg uppercase leading-none">
            Reviewer agent
          </h2>
          <p className="mt-1 text-xs leading-5 text-paper/55">
            MCP-bounded next moves over review work items.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Badge className="rounded-none border-paper/15 bg-transparent text-paper/70" variant="outline">
            {control.queue.length} open
          </Badge>
          <Badge className="rounded-none border-paper/15 bg-transparent text-paper/70" variant="outline">
            {isLoading ? "Planning" : "Deterministic"}
          </Badge>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-3">
          <div className="grid gap-2">
            <h3 className="font-heading text-sm uppercase leading-none">
              ROI choices
            </h3>
            {error ? (
              <div className="flex items-start gap-2 border border-paper/15 px-3 py-2 text-xs leading-5 text-paper/65">
                <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
            {!error && isLoading ? (
              <div className="border border-paper/15 px-3 py-2 text-xs text-paper/55">
                Planning review boundary...
              </div>
            ) : null}
            {!error && !isLoading && effectivePlan?.choices.length === 0 ? (
              <div className="border border-paper/15 px-3 py-2 text-xs text-paper/55">
                No planner choices available.
              </div>
            ) : null}
            {!error && effectivePlan?.choices.length
              ? effectivePlan.choices.map((choice) => {
                  const itemIds = affectedItemIds(choice, effectivePlan);
                  const isSelected = itemIds.some(
                    (itemId) => localStages[itemId]?.choiceLabel === choice.label,
                  );

                  return (
                    <button
                      aria-label={`Select ${choice.label}`}
                      aria-pressed={isSelected}
                      className="text-left"
                      data-reviewer-plan-choice={choice.id}
                      key={choice.choiceRef}
                      onClick={() => selectChoice(choice)}
                      type="button"
                    >
                      <StageCard choice={choice} isSelected={isSelected} itemIds={itemIds} />
                    </button>
                  );
                })
              : null}
          </div>
        </div>
      </ScrollArea>

      {stagedCount > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-paper/15 px-4 py-3 text-xs text-paper/55">
          <span>
            {stagedCount} local transition preview{stagedCount === 1 ? "" : "s"} staged.
          </span>
          <Button
            className="h-7 rounded-none border-paper/15 bg-transparent px-2.5 text-xs text-paper hover:bg-paper hover:text-ink"
            onClick={() => setLocalStages({})}
            size="xs"
            type="button"
            variant="outline"
          >
            Reset
          </Button>
        </div>
      ) : null}
    </section>
  );
}
