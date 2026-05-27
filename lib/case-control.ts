import type {
  CaseWorkspaceDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";
import type { ReviewWorkItem } from "@/lib/contracts/review-work-item";
import { buildHarnessReflection } from "@/lib/harness-reflection";
import { compareReviewWorkItems } from "@/lib/review-work-items";

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
  blocking: boolean;
  kind: "conflict" | "revision" | "timeline" | "missing" | "source_check";
  priority: "critical" | "high" | "medium" | "low";
  reviewPrompt: string;
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
  item: ReviewWorkItem,
  spans: Map<string, CaseWorkspaceSourceSpanDto>,
  docs: Map<string, { fileName: string; title: string }>,
): CaseControlItemDto {
  return {
    blocking: item.blocking,
    id: item.id,
    kind: item.kind.family,
    priority: item.priority,
    reviewPrompt: item.reviewPrompt,
    sourceRefs: findSourceRefs(item.sourceSpanIds, spans, docs),
    summary: item.summary,
    title: item.title,
  };
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
  const activeWorkItems = workspace.reviewWorkItems
    .filter((item) => item.status === "open")
    .sort(compareReviewWorkItems);
  const activeQueue = activeWorkItems.map((item) =>
    toControlItem(item, spans, docs),
  );
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
