import "server-only";

import { z } from "zod";

import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import {
  getRoiReviewPlanOutputSchema,
  roiReviewPlanChoiceSchema,
} from "@/lib/contracts/mcp";
import {
  deriveReviewWorkItemCapability,
  reviewActionEventToWorkItemEvent,
  reviewWorkItemStatusAfterEvent,
  type ReviewWorkItem,
} from "@/lib/contracts/review-work-item";
import { reviewerPlanRef } from "@/lib/server/mcp/v1/refs";
import {
  caseSummary,
  nowIso,
  openReviewWorkItems,
  reviewWorkItemRef,
} from "@/lib/server/mcp/v1/projections";
import { MurdockMcpServiceError } from "@/lib/server/mcp/v1/errors";

export const digestGroups = [
  {
    audience: "legal_judgment",
    description:
      "Conflicts or legal choices that need qualified legal judgment before filing decisions are made.",
    key: "legal_judgment",
    label: "Legal judgment",
  },
  {
    audience: "factual_completion",
    description:
      "Blocking form-filling or attachment work that should be completed before the case proceeds.",
    key: "factual_completion",
    label: "Factual completion",
  },
  {
    audience: "document_version_review",
    description:
      "Document revision changes that may affect what the reviewer should compare or confirm.",
    key: "document_updates",
    label: "Document updates",
  },
  {
    audience: "operational_followup",
    description:
      "Nonblocking cleanup items that can be handled after the blocking work is understood.",
    key: "operational_followup",
    label: "Operational follow-up",
  },
] as const;

export type DigestGroupKey = (typeof digestGroups)[number]["key"];

const priorityRank: Record<ReviewWorkItem["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function sortReviewActions(left: ReviewWorkItem, right: ReviewWorkItem) {
  return (
    priorityRank[left.priority] - priorityRank[right.priority] ||
    Number(right.blocking) - Number(left.blocking) ||
    left.title.localeCompare(right.title)
  );
}

function digestGroupKey(item: ReviewWorkItem): DigestGroupKey {
  const capability = deriveReviewWorkItemCapability(item);

  if (capability === "legal_judgment") {
    return "legal_judgment";
  }

  if (capability === "document_version_review") {
    return "document_updates";
  }

  if (
    capability === "factual_completion" ||
    capability === "filing_preparation" ||
    capability === "source_verification"
  ) {
    return "factual_completion";
  }

  return "operational_followup";
}

function highestPriority(items: ReviewWorkItem[]) {
  return items.reduce<ReviewWorkItem["priority"]>(
    (highest, item) =>
      priorityRank[item.priority] < priorityRank[highest]
        ? item.priority
        : highest,
    "low",
  );
}

function reviewDigestItem(item: ReviewWorkItem) {
  return {
    actionRef: reviewWorkItemRef(item),
    blocking: item.blocking,
    kind: item.kind.family,
    priority: item.priority,
    requiredCapability: deriveReviewWorkItemCapability(item),
    sourceSpanCount: item.sourceSpanIds.length,
    summary: item.summary,
    title: item.title,
  };
}

function reviewTheme(item: ReviewWorkItem) {
  const text = `${item.title} ${item.summary}`.toLowerCase();

  if (text.includes("signature") || text.includes("signed")) {
    return "signature";
  }

  if (text.includes("date") || text.includes("deadline")) {
    return "date";
  }

  if (/income|asset|liabil|payment/.test(text)) {
    return "financial";
  }

  if (/court|filing|chapter|fee/.test(text)) {
    return "filing";
  }

  return item.kind.family;
}

function themeLabel(theme: string) {
  const labels: Record<string, string> = {
    conflict: "source conflicts",
    date: "date gaps",
    filing: "filing readiness",
    financial: "financial blanks",
    missing: "missing support",
    revision: "version review",
    signature: "signature blockers",
    source_check: "source support",
    timeline: "timeline placement",
  };

  return labels[theme] ?? "top blockers";
}

function reviewRisk(items: ReviewWorkItem[]) {
  if (
    items.some(
      (item) =>
        item.priority === "critical" ||
        deriveReviewWorkItemCapability(item) === "legal_judgment",
    )
  ) {
    return "high" as const;
  }

  if (items.some((item) => item.blocking || item.priority === "high")) {
    return "medium" as const;
  }

  return "low" as const;
}

function uniqueSortedActions(items: ReviewWorkItem[]) {
  const seen = new Set<string>();
  const sorted = [];

  for (const item of [...items].sort(sortReviewActions)) {
    const ref = reviewWorkItemRef(item);

    if (seen.has(ref)) {
      continue;
    }

    seen.add(ref);
    sorted.push(item);
  }

  return sorted;
}

function groupedActions(
  items: ReviewWorkItem[],
  keyFor: (item: ReviewWorkItem) => string,
) {
  const groups = new Map<string, ReviewWorkItem[]>();

  for (const item of items) {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()].sort(
    (left, right) =>
      right[1].filter((item) => item.blocking).length -
        left[1].filter((item) => item.blocking).length ||
      right[1].length - left[1].length ||
      left[0].localeCompare(right[0]),
  );
}

function roiChoice(input: {
  caseKey: string;
  detail: string;
  eventType: "comment" | "resolved" | "dismissed" | "reopened";
  id: string;
  items: ReviewWorkItem[];
  label: string;
  rationale: string;
  stageState: "staged" | "deferred" | "dismissed";
  tone: "recommended" | "self_start" | "cleanup";
}) {
  const refs = input.items.map(reviewWorkItemRef).slice(0, 12);

  return roiReviewPlanChoiceSchema.parse({
    affectedReviewRefs: refs,
    choiceRef: reviewerPlanRef(
      `${input.caseKey}:${input.id}:${refs.join("|")}`,
    ),
    detail: input.detail,
    eventType: input.eventType,
    id: input.id,
    label: input.label,
    rationale: input.rationale,
    risk: reviewRisk(input.items),
    stageState: input.stageState,
    tone: input.tone,
  });
}

function dedupeRoiChoices(
  choices: Array<z.infer<typeof roiReviewPlanChoiceSchema>>,
) {
  const seen = new Set<string>();

  return choices.filter((choice) => {
    const key = [...choice.affectedReviewRefs].sort().join("|");

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function buildRoiReviewPlan(input: {
  activeReviewRef: string | null;
  maxChoices: number;
  workspace: CaseWorkspaceDto;
}) {
  const items = uniqueSortedActions(openReviewWorkItems(input.workspace));
  const caseKey = input.workspace.case.slug ?? input.workspace.case.id;
  const highValueItems = uniqueSortedActions(
    items.filter((item) => item.blocking || item.priority !== "low"),
  );
  const candidates = highValueItems.length > 0 ? highValueItems : items;
  const grouped =
    groupedActions(candidates, reviewTheme).find(([, group]) => group.length >= 2)
      ?.[1] ?? candidates;
  const primary = uniqueSortedActions(grouped).slice(0, 8);
  const active =
    items.find((item) => reviewWorkItemRef(item) === input.activeReviewRef) ??
    candidates[0] ??
    null;
  const choices: Array<z.infer<typeof roiReviewPlanChoiceSchema>> = [];

  if (primary.length > 0) {
    const theme = reviewTheme(primary[0]!);
    choices.push(
      roiChoice({
        caseKey,
        detail: `Stage ${primary.length} related review item${
          primary.length === 1 ? "" : "s"
        }.`,
        eventType: "comment",
        id: "review_high_roi_batch",
        items: primary,
        label:
          primary.length > 1
            ? `Review ${themeLabel(theme)}`
            : primary[0]?.title ?? "Review top item",
        rationale: "Keeps the next move bounded while preserving source review.",
        stageState: "staged",
        tone: "recommended",
      }),
    );
  }

  if (active) {
    choices.push(
      roiChoice({
        caseKey,
        detail: "Handle only the active review item.",
        eventType: "comment",
        id: "work_current_review_item",
        items: [active],
        label: "Work current item",
        rationale: "This is the narrowest reversible next step.",
        stageState: "staged",
        tone: "self_start",
      }),
    );
  }

  const sourceSweep = uniqueSortedActions(
    items.filter((item) => item.sourceSpanIds.length > 0),
  ).slice(0, 8);
  const cleanup = uniqueSortedActions(
    items.filter((item) => !item.blocking && item.priority === "low"),
  ).slice(0, 8);

  if (sourceSweep.length >= 2) {
    choices.push(
      roiChoice({
        caseKey,
        detail: `Check source support for ${sourceSweep.length} review items.`,
        eventType: "comment",
        id: "run_source_support_sweep",
        items: sourceSweep,
        label: "Run source sweep",
        rationale: "Confirms evidence before legal calls are made.",
        stageState: "staged",
        tone: "self_start",
      }),
    );
  } else if (cleanup.length >= 2) {
    choices.push(
      roiChoice({
        caseKey,
        detail: `Preview dismissal for ${cleanup.length} low-risk items.`,
        eventType: "dismissed",
        id: "dismiss_low_risk_cleanup",
        items: cleanup,
        label: "Dismiss low-risk cleanup",
        rationale: "Nonblocking cleanup should not dominate review time.",
        stageState: "dismissed",
        tone: "cleanup",
      }),
    );
  }

  return getRoiReviewPlanOutputSchema.parse({
    case: caseSummary(input.workspace.case),
    choices: dedupeRoiChoices(choices).slice(0, input.maxChoices),
    generatedAt: nowIso(),
    mcpTrace: [],
    model: null,
    plannerKind: "deterministic",
    provider: null,
    warnings:
      items.length > 0
        ? []
        : ["No open review items are available for ROI planning."],
  });
}

function groupedReviewActions(input: {
  includeLowPriority: boolean;
  workspace: CaseWorkspaceDto;
}) {
  const actions = openReviewWorkItems(input.workspace);
  const visibleActions = input.includeLowPriority
    ? actions
    : actions.filter((action) => action.priority !== "low");

  return {
    actions,
    groups: digestGroups.map((definition) => ({
      definition,
      groupActions: visibleActions
        .filter((action) => digestGroupKey(action) === definition.key)
        .sort(sortReviewActions),
    })),
  };
}

export function buildReviewDigest(input: {
  includeLowPriority: boolean;
  workspace: CaseWorkspaceDto;
}) {
  const { actions, groups: groupedActions } = groupedReviewActions(input);

  const groups = digestGroups.flatMap((definition) => {
    const groupActions =
      groupedActions.find((group) => group.definition.key === definition.key)
        ?.groupActions ?? [];

    if (groupActions.length === 0) {
      return [];
    }

    const sampleTitles = groupActions.slice(0, 2).map((action) => action.title);

    return [
      {
        ...definition,
        itemCount: groupActions.length,
        items: [],
        omittedCount: groupActions.length,
        priority: highestPriority(groupActions),
        sampleTitles,
      },
    ];
  });

  return {
    case: caseSummary(input.workspace.case),
    counts: {
      blockingOpenActionCount: actions.filter((action) => action.blocking).length,
      conflictOpenActionCount: actions.filter(
        (item) => item.kind.family === "conflict",
      ).length,
      lowPriorityOpenActionCount: actions.filter(
        (action) => action.priority === "low",
      ).length,
      omittedLowPriorityCount: input.includeLowPriority
        ? 0
        : actions.filter((action) => action.priority === "low").length,
      openActionCount: actions.length,
      revisionOpenActionCount: actions.filter(
        (item) => item.kind.family === "revision",
      ).length,
    },
    generatedAt: nowIso(),
    groups,
  };
}

export function buildReviewGroup(input: {
  groupKey: DigestGroupKey;
  includeLowPriority: boolean;
  maxItems: number;
  workspace: CaseWorkspaceDto;
}) {
  const { groups } = groupedReviewActions(input);
  const selectedGroup = groups.find(
    (group) => group.definition.key === input.groupKey,
  );
  const groupActions = selectedGroup?.groupActions ?? [];
  const definition =
    selectedGroup?.definition ??
    digestGroups.find((group) => group.key === input.groupKey);

  if (!definition) {
    throw new MurdockMcpServiceError(
      "schema_validation",
      "Unknown review digest group.",
      false,
    );
  }

  const items = groupActions.slice(0, input.maxItems).map(reviewDigestItem);

  return {
    case: caseSummary(input.workspace.case),
    generatedAt: nowIso(),
    group: {
      ...definition,
      itemCount: groupActions.length,
      items,
      omittedCount: Math.max(0, groupActions.length - items.length),
      priority: highestPriority(groupActions),
      sampleTitles: groupActions.slice(0, 2).map((action) => action.title),
    },
  };
}

export function statusAfterReviewEvent(input: {
  currentStatus: ReviewWorkItem["status"];
  eventType: "comment" | "resolved" | "dismissed" | "reopened";
}) {
  return reviewWorkItemStatusAfterEvent({
    currentStatus: input.currentStatus,
    eventType: reviewActionEventToWorkItemEvent(input.eventType),
  });
}

export function transitionPreviewWarnings(input: {
  actions: ReviewWorkItem[];
  eventType: "comment" | "resolved" | "dismissed" | "reopened";
}) {
  const warnings = [];

  if (
    input.eventType === "dismissed" &&
    input.actions.some((action) => action.blocking)
  ) {
    warnings.push("Preview includes dismissal of at least one blocking action.");
  }

  if (
    input.eventType === "resolved" &&
    input.actions.some(
      (action) => deriveReviewWorkItemCapability(action) === "legal_judgment",
    )
  ) {
    warnings.push("Preview includes resolving a legal-judgment action.");
  }

  if (
    input.actions.some(
      (action) => action.status !== "open" && input.eventType !== "reopened",
    )
  ) {
    warnings.push("Preview includes actions that are not currently open.");
  }

  return warnings;
}
