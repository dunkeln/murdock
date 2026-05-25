import {
  caseWorkspaceIssueSeverityRank,
  caseWorkspaceIssueTypeLabels,
} from "@/lib/case-workspace";
import type {
  CaseWorkspaceDto,
  CaseWorkspaceFactDto,
  CaseWorkspaceIssueDto,
  CaseWorkspaceSourceDocumentDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";

const CONTEXT_FACT_LIMIT = 20;
const CONTEXT_ISSUE_LIMIT = 16;
const CONTEXT_SPAN_LIMIT = 32;
const EXCERPT_LIMIT = 700;

export type HarnessReflection = {
  docs: CaseWorkspaceSourceDocumentDto[];
  facts: CaseWorkspaceFactDto[];
  isLive: boolean;
  issues: CaseWorkspaceIssueDto[];
  sourceSpans: CaseWorkspaceSourceSpanDto[];
  stats: {
    docCount: number;
    factCount: number;
    highIssueCount: number;
    issueCount: number;
    openIssueCount: number;
    sourceSpanCount: number;
  };
};

function intersects(values: string[], ids: Set<string>) {
  return values.some((value) => ids.has(value));
}

function compareIssues(
  left: CaseWorkspaceIssueDto,
  right: CaseWorkspaceIssueDto,
) {
  return (
    caseWorkspaceIssueSeverityRank[left.severity] -
      caseWorkspaceIssueSeverityRank[right.severity] ||
    left.status.localeCompare(right.status) ||
    left.title.localeCompare(right.title)
  );
}

function truncate(value: string, limit = EXCERPT_LIMIT) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

export function buildHarnessReflection(
  workspace: CaseWorkspaceDto,
): HarnessReflection {
  const docs = workspace.sourceDocuments.filter(
    (document) => document.ocrConversionId,
  );
  const docIds = new Set(docs.map((document) => document.id));
  const sourceSpans = workspace.sourceSpans.filter((span) =>
    docIds.has(span.sourceDocumentId),
  );
  const spanIds = new Set(sourceSpans.map((span) => span.id));
  const allDocsAreLive =
    docs.length > 0 && docs.length === workspace.sourceDocuments.length;
  const facts = workspace.facts.filter((fact) => {
    return allDocsAreLive || intersects(fact.sourceSpanIds, spanIds);
  });
  const issues = workspace.issues
    .filter((issue) => {
      return allDocsAreLive || intersects(issue.sourceSpanIds, spanIds);
    })
    .sort(compareIssues);

  return {
    docs,
    facts,
    isLive: docs.length > 0,
    issues,
    sourceSpans,
    stats: {
      docCount: docs.length,
      factCount: facts.length,
      highIssueCount: issues.filter((issue) => issue.severity === "high")
        .length,
      issueCount: issues.length,
      openIssueCount: issues.filter((issue) => issue.status === "open").length,
      sourceSpanCount: sourceSpans.length,
    },
  };
}

export function buildHarnessQueryContext(workspace: CaseWorkspaceDto) {
  const reflection = buildHarnessReflection(workspace);
  const spanById = new Map(
    reflection.sourceSpans.map((span) => [span.id, span]),
  );
  const docById = new Map(reflection.docs.map((doc) => [doc.id, doc]));
  const sourceSpanIds = new Set(
    [...reflection.facts, ...reflection.issues].flatMap(
      (item) => item.sourceSpanIds,
    ),
  );

  return {
    isLive: reflection.isLive,
    stats: reflection.stats,
    case: {
      id: workspace.case.id,
      title: workspace.case.title,
      type: workspace.case.type,
    },
    documents: reflection.docs.map((doc) => ({
      id: doc.id,
      fileName: doc.fileName,
      title: doc.title,
      ocrStatus: doc.ocrStatus,
    })),
    facts: reflection.facts.slice(0, CONTEXT_FACT_LIMIT).map((fact) => ({
      id: fact.id,
      label: fact.label,
      category: fact.category,
      kind: fact.categoryDetail,
      value: fact.normalizedValue ?? fact.statedValue,
      sourceSpanIds: fact.sourceSpanIds,
    })),
    issues: reflection.issues.slice(0, CONTEXT_ISSUE_LIMIT).map((issue) => ({
      id: issue.id,
      type: issue.issueType,
      typeLabel: caseWorkspaceIssueTypeLabels[issue.issueType],
      severity: issue.severity,
      status: issue.status,
      title: issue.title,
      description: issue.description,
      provenanceSummary: issue.provenanceSummary,
      sourceSpanIds: issue.sourceSpanIds,
    })),
    sourceExcerpts: [...sourceSpanIds].slice(0, CONTEXT_SPAN_LIMIT).flatMap(
      (sourceSpanId) => {
        const span = spanById.get(sourceSpanId);
        if (!span) {
          return [];
        }
        const doc = docById.get(span.sourceDocumentId);

        return [
          {
            id: span.id,
            document: doc?.fileName ?? "Unknown document",
            page: span.pageLabel,
            excerpt: truncate(span.verbatimExcerpt),
          },
        ];
      },
    ),
  };
}
