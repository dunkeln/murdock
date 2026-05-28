import "server-only";

import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import {
  deriveReviewWorkItemCapability,
  reviewActionEventToWorkItemEvent,
  reviewWorkItemStatusAfterEvent,
  type ReviewWorkItem,
} from "@/lib/contracts/review-work-item";
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
