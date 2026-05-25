import {
  caseWorkspaceIssueSeverityRank,
  caseWorkspaceIssueTypeLabels,
} from "@/lib/case-workspace";
import type {
  CaseWorkspaceDto,
  CaseWorkspaceIssueDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";
import { buildHarnessReflection } from "@/lib/harness-reflection";

export type CaseControlReadiness =
  | "empty"
  | "source_ready"
  | "preparing"
  | "needs_review"
  | "ready";

export type CaseControlRole = "lawyer" | "paralegal" | "legal_ops" | null;

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
  assignedRole: CaseControlRole;
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
  pageIndex: number | null;
  spanIds: ReadonlySet<string>;
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

function issueRole(issue: CaseWorkspaceIssueDto): CaseControlRole {
  if (
    issue.issueType === "contradiction" ||
    (issue.issueType === "revision_drift" && issue.severity === "high")
  ) {
    return "lawyer";
  }
  if (
    issue.issueType === "chronology_gap" ||
    issue.issueType === "missing_context"
  ) {
    return "paralegal";
  }
  return "legal_ops";
}

function issuePriority(issue: CaseWorkspaceIssueDto) {
  return issue.severity === "high" ? "high" : issue.severity;
}

function findSourceRefs(
  issue: CaseWorkspaceIssueDto,
  spans: Map<string, CaseWorkspaceSourceSpanDto>,
  docs: Map<string, { fileName: string; title: string }>,
): CaseControlSourceRef[] {
  return issue.sourceSpanIds.slice(0, 2).flatMap((spanId) => {
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
    assignedRole: issueRole(issue),
    blocking: issue.severity === "high" || issue.issueType === "contradiction",
    kind: issueKind(issue),
    priority: issuePriority(issue),
    sourceRefs: findSourceRefs(issue, spans, docs),
    summary:
      issue.description ??
      issue.provenanceSummary ??
      caseWorkspaceIssueTypeLabels[issue.issueType],
    title: issue.title,
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

function sourceRefMatchesGrounding(
  sourceRef: CaseControlSourceRef,
  grounding: CaseControlSourceGrounding,
) {
  return (
    grounding.docId !== null &&
    grounding.fileName !== null &&
    grounding.pageIndex !== null &&
    sourceRef.docId === grounding.docId &&
    sourceRef.fileName === grounding.fileName &&
    sourceRef.pageIndex === grounding.pageIndex &&
    grounding.spanIds.has(sourceRef.spanId)
  );
}

export function filterCaseControlBySourceGrounding(
  control: CaseControlDto,
  grounding: CaseControlSourceGrounding,
): CaseControlDto {
  const queue = control.queue.flatMap((item) => {
    const sourceRefs = item.sourceRefs.filter((sourceRef) =>
      sourceRefMatchesGrounding(sourceRef, grounding),
    );

    if (sourceRefs.length === 0) {
      return [];
    }

    return [
      {
        ...item,
        sourceRefs,
      },
    ];
  });

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
    .slice(0, 5)
    .map((issue) => toControlItem(issue, spans, docs));
  const activeItem = queue[0] ?? null;
  const copy = primaryCopy({
    activeItem,
    docs: reflection.stats.docCount,
    openItems: reflection.stats.openIssueCount,
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
    queue,
    readiness: copy.readiness,
    stats: {
      docs: reflection.stats.docCount,
      facts: reflection.stats.factCount,
      openItems: reflection.stats.openIssueCount,
      sources: reflection.stats.sourceSpanCount,
    },
  };
}
