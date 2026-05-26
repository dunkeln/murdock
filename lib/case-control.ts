import {
  caseWorkspaceIssueSeverityRank,
  caseWorkspaceIssueTypeLabels,
} from "@/lib/case-workspace";
import type {
  CaseWorkspaceDto,
  CaseWorkspaceIssueDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";
import type { CaseReviewActionDto } from "@/lib/contracts/review-reducer";
import { buildHarnessReflection } from "@/lib/harness-reflection";

export type CaseControlReadiness =
  | "empty"
  | "source_ready"
  | "preparing"
  | "needs_review"
  | "ready";

export type CaseControlSourceRef = {
  docId: string;
  document: string;
  fileName: string;
  pageIndex: number | null;
  page: string | null;
  quote: string;
  spanId: string;
};

export type CaseControlItemDto = {
  id: string;
  actionLabel: string;
  blocking: boolean;
  kind: "conflict" | "revision" | "timeline" | "missing" | "source_check";
  priority: "critical" | "high" | "medium" | "low";
  sourceRefs: CaseControlSourceRef[];
  summary: string;
  title: string;
};

export type CaseControlDto = {
  activeItem: CaseControlItemDto | null;
  case: {
    id: string;
    priority: string;
    title: string;
  };
  footerEnabled: boolean;
  primaryDetail: string;
  primaryMessage: string;
  queue: CaseControlItemDto[];
  readiness: CaseControlReadiness;
  stats: {
    docs: number;
    facts: number;
    openItems: number;
    sources: number;
  };
};

export type CaseControlSourceGrounding = {
  docId: string | null;
  fileName: string | null;
};

const priorityLabels = {
  high: "High",
  low: "Low",
  normal: "Normal",
  urgent: "Urgent",
} satisfies Record<CaseWorkspaceDto["case"]["priority"], string>;

function issueKind(issue: CaseWorkspaceIssueDto): CaseControlItemDto["kind"] {
  if (issue.issueType === "contradiction") {
    return "conflict";
  }
  if (issue.issueType === "revision_drift") {
    return "revision";
  }
  if (issue.issueType === "chronology_gap") {
    return "timeline";
  }
  return "missing";
}

function issueAction(issue: CaseWorkspaceIssueDto) {
  if (issue.issueType === "contradiction") {
    return "Choose controlling source";
  }
  if (issue.issueType === "revision_drift") {
    return "Check current version";
  }
  if (issue.issueType === "chronology_gap") {
    return "Place in timeline";
  }
  return "Find support";
}

function issuePriority(issue: CaseWorkspaceIssueDto) {
  return issue.severity === "high" ? "high" : issue.severity;
}

function findSourceRefs(
  sourceSpanIds: string[],
  spans: Map<string, CaseWorkspaceSourceSpanDto>,
  docs: Map<string, { fileName: string; title: string }>,
): CaseControlSourceRef[] {
  return sourceSpanIds.slice(0, 2).flatMap((spanId) => {
    const span = spans.get(spanId);

    if (!span) {
      return [];
    }

    const sourceDoc = docs.get(span.sourceDocumentId);

    return [
      {
        docId: span.sourceDocumentId,
        document: sourceDoc?.title ?? sourceDoc?.fileName ?? "Source document",
        fileName: sourceDoc?.fileName ?? "Source document",
        pageIndex: span.pageIndex,
        page: span.pageLabel,
        quote: span.verbatimExcerpt,
        spanId: span.id,
      },
    ];
  });
}

function toControlItem(
  issue: CaseWorkspaceIssueDto,
  spans: Map<string, CaseWorkspaceSourceSpanDto>,
  docs: Map<string, { fileName: string; title: string }>,
): CaseControlItemDto {
  return {
    id: issue.id,
    actionLabel: issueAction(issue),
    blocking: issue.severity === "high" || issue.issueType === "contradiction",
    kind: issueKind(issue),
    priority: issuePriority(issue),
    sourceRefs: findSourceRefs(issue.sourceSpanIds, spans, docs),
    summary:
      issue.description ??
      issue.provenanceSummary ??
      caseWorkspaceIssueTypeLabels[issue.issueType],
    title: issue.title,
  };
}

function toControlItemFromReviewAction(
  action: CaseReviewActionDto,
  spans: Map<string, CaseWorkspaceSourceSpanDto>,
  docs: Map<string, { fileName: string; title: string }>,
): CaseControlItemDto {
  return {
    id: action.id,
    actionLabel: action.actionLabel,
    blocking: action.blocking,
    kind: action.kind,
    priority: action.priority,
    sourceRefs: findSourceRefs(action.sourceSpanIds, spans, docs),
    summary: action.summary,
    title: action.title,
  };
}

function compareIssues(left: CaseWorkspaceIssueDto, right: CaseWorkspaceIssueDto) {
  return (
    caseWorkspaceIssueSeverityRank[left.severity] -
      caseWorkspaceIssueSeverityRank[right.severity] ||
    right.detectedAt.localeCompare(left.detectedAt) ||
    left.title.localeCompare(right.title)
  );
}

const reviewActionPriorityRank = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} satisfies Record<CaseReviewActionDto["priority"], number>;

function compareReviewActions(
  left: CaseReviewActionDto,
  right: CaseReviewActionDto,
) {
  return (
    reviewActionPriorityRank[left.priority] -
      reviewActionPriorityRank[right.priority] ||
    Number(right.blocking) - Number(left.blocking) ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.title.localeCompare(right.title)
  );
}

function sourceRefMatchesGrounding(
  sourceRef: CaseControlSourceRef,
  grounding: CaseControlSourceGrounding,
) {
  return (
    (grounding.docId !== null && sourceRef.docId === grounding.docId) ||
    (grounding.fileName !== null && sourceRef.fileName === grounding.fileName)
  );
}

function compareSourceRefs(
  left: CaseControlSourceRef,
  right: CaseControlSourceRef,
) {
  return (
    (left.pageIndex ?? Number.MAX_SAFE_INTEGER) -
      (right.pageIndex ?? Number.MAX_SAFE_INTEGER) ||
    left.spanId.localeCompare(right.spanId)
  );
}

export function filterCaseControlBySourceGrounding(
  control: CaseControlDto,
  grounding: CaseControlSourceGrounding,
): CaseControlDto {
  const groundedQueue = control.queue.flatMap((item, itemIndex) => {
    const sourceRefs = item.sourceRefs.filter((sourceRef) =>
      sourceRefMatchesGrounding(sourceRef, grounding),
    );

    if (sourceRefs.length === 0) {
      return [];
    }

    const orderedSourceRefs = [...sourceRefs].sort(compareSourceRefs);

    return [
      {
        item: {
          ...item,
          sourceRefs: orderedSourceRefs,
        },
        sourceOrder:
          orderedSourceRefs[0]?.pageIndex ??
          Number.MAX_SAFE_INTEGER,
        queueOrder: itemIndex,
      },
    ];
  });
  const queue = groundedQueue.sort(
    (left, right) =>
      left.sourceOrder - right.sourceOrder ||
      left.queueOrder - right.queueOrder,
  ).map((entry) => entry.item);

  return {
    ...control,
    activeItem: queue[0] ?? null,
    queue,
  };
}

function primaryCopy(input: {
  docs: number;
  openItems: number;
  activeItem: CaseControlItemDto | null;
}) {
  if (input.docs === 0) {
    return {
      detail: "Add source material",
      message: "Waiting on source",
      readiness: "empty" as const,
    };
  }

  if (input.openItems > 0 && input.activeItem) {
    return {
      detail: input.activeItem.title,
      message: "Open item",
      readiness: "needs_review" as const,
    };
  }

  return {
    detail: "Ready",
    message: "Ready",
    readiness: "ready" as const,
  };
}

export function buildCaseControlDto(workspace: CaseWorkspaceDto): CaseControlDto {
  const reflection = buildHarnessReflection(workspace);
  const spans = new Map(reflection.sourceSpans.map((span) => [span.id, span]));
  const docs = new Map(
    reflection.docs.map((doc) => [
      doc.id,
      {
        fileName: doc.fileName,
        title: doc.title || doc.fileName,
      },
    ]),
  );
  const queue = reflection.issues
    .filter((issue) => issue.status === "open")
    .sort(compareIssues)
    .map((issue) => toControlItem(issue, spans, docs));
  const reducedQueue = workspace.reviewActions
    .filter((action) => action.status === "open")
    .sort(compareReviewActions)
    .map((action) => toControlItemFromReviewAction(action, spans, docs));
  const activeQueue = workspace.reviewActions.length > 0 ? reducedQueue : queue;
  const activeItem = activeQueue[0] ?? null;
  const copy = primaryCopy({
    activeItem,
    docs: reflection.stats.docCount,
    openItems: activeQueue.length,
  });

  return {
    activeItem,
    case: {
      id: workspace.case.id,
      priority: priorityLabels[workspace.case.priority],
      title: workspace.case.title,
    },
    footerEnabled: reflection.isLive,
    primaryDetail: copy.detail,
    primaryMessage: copy.message,
    queue: activeQueue,
    readiness: copy.readiness,
    stats: {
      docs: reflection.stats.docCount,
      facts: reflection.stats.factCount,
      openItems: activeQueue.length,
      sources: reflection.stats.sourceSpanCount,
    },
  };
}
