import type {
  CaseWorkspaceFactDto,
  CaseWorkspaceIssueDto,
  CaseWorkspaceSourceDocumentDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";

type SnapshotValue = Record<string, unknown>;

export type RevisionSnapshotEntry = {
  label: string;
  sourceSpanIds: string[];
  value: SnapshotValue;
};

export type RevisionSnapshot = {
  document: {
    fileName: string;
    sourceDocumentId: string;
    sourceKind: string;
    title: string;
  };
  entries: Record<string, RevisionSnapshotEntry>;
};

export type RevisionSnapshotWorkspace = {
  facts: CaseWorkspaceFactDto[];
  issues: CaseWorkspaceIssueDto[];
  sourceSpans: CaseWorkspaceSourceSpanDto[];
};

function intersects(left: string[], right: Set<string>) {
  return left.some((item) => right.has(item));
}

function factValue(fact: CaseWorkspaceFactDto): SnapshotValue {
  return {
    calculatedValue: fact.calculatedValue,
    category: fact.category,
    categoryDetail: fact.categoryDetail,
    effectiveAt: fact.effectiveAt,
    isCurrent: fact.isCurrent,
    normalizedValue: fact.normalizedValue,
    observedAt: fact.observedAt,
    statedValue: fact.statedValue,
    valueType: fact.valueType,
  };
}

function issueValue(issue: CaseWorkspaceIssueDto): SnapshotValue {
  return {
    description: issue.description,
    issueType: issue.issueType,
    provenanceSummary: issue.provenanceSummary,
    severity: issue.severity,
    status: issue.status,
    title: issue.title,
  };
}

export function buildRevisionSnapshot(input: {
  sourceDocument: CaseWorkspaceSourceDocumentDto;
  workspace: RevisionSnapshotWorkspace;
}): RevisionSnapshot {
  const sourceSpanIds = new Set(
    input.workspace.sourceSpans
      .filter((span) => span.sourceDocumentId === input.sourceDocument.id)
      .map((span) => span.id),
  );
  const entries: Record<string, RevisionSnapshotEntry> = {};

  for (const fact of input.workspace.facts) {
    if (!intersects(fact.sourceSpanIds, sourceSpanIds)) {
      continue;
    }

    entries[`facts.${fact.factKey}`] = {
      label: fact.label,
      sourceSpanIds: fact.sourceSpanIds.filter((spanId) => sourceSpanIds.has(spanId)),
      value: factValue(fact),
    };
  }

  for (const issue of input.workspace.issues) {
    if (!intersects(issue.sourceSpanIds, sourceSpanIds)) {
      continue;
    }

    entries[`issues.${issue.issueKey}`] = {
      label: issue.title,
      sourceSpanIds: issue.sourceSpanIds.filter((spanId) => sourceSpanIds.has(spanId)),
      value: issueValue(issue),
    };
  }

  return {
    document: {
      fileName: input.sourceDocument.fileName,
      sourceDocumentId: input.sourceDocument.id,
      sourceKind: input.sourceDocument.sourceKind,
      title: input.sourceDocument.title,
    },
    entries,
  };
}
