import type {
  CaseWorkspaceChronologyEventDto,
  CaseWorkspaceDto,
  CaseWorkspaceIssueDto,
  CaseWorkspaceIssueSeverity,
  CaseWorkspaceIssueType,
} from "@/lib/contracts/case-workspace";

export const caseWorkspaceIssueTypeLabels = {
  revision_drift: "Revision drift",
  contradiction: "Contradiction",
  chronology_gap: "Chronology gap",
  missing_context: "Missing context",
} satisfies Record<CaseWorkspaceIssueType, string>;

export const caseWorkspaceIssueSeverityLabels = {
  high: "High",
  medium: "Medium",
  low: "Low",
} satisfies Record<CaseWorkspaceIssueSeverity, string>;

export const caseWorkspaceIssueSeverityRank = {
  high: 0,
  medium: 1,
  low: 2,
} satisfies Record<CaseWorkspaceIssueSeverity, number>;

export type CaseWorkspaceIssueGroup = {
  issueType: CaseWorkspaceIssueType;
  label: string;
  issues: CaseWorkspaceIssueDto[];
};

const issueTypeOrder: CaseWorkspaceIssueType[] = [
  "contradiction",
  "revision_drift",
  "chronology_gap",
  "missing_context",
];

export function groupCaseWorkspaceIssuesByType(
  issues: CaseWorkspaceIssueDto[]
): CaseWorkspaceIssueGroup[] {
  return issueTypeOrder
    .map((issueType) => ({
      issueType,
      label: caseWorkspaceIssueTypeLabels[issueType],
      issues: issues
        .filter((issue) => issue.issueType === issueType)
        .sort((left, right) => {
          return (
            caseWorkspaceIssueSeverityRank[left.severity] -
              caseWorkspaceIssueSeverityRank[right.severity] ||
            left.title.localeCompare(right.title)
          );
        }),
    }))
    .filter((group) => group.issues.length > 0);
}

export type CaseWorkspaceHealthSummary = {
  sourceCount: number;
  factCount: number;
  chronologyEventCount: number;
  issueCount: number;
  highSeverityIssueCount: number;
};

export function summarizeCaseWorkspace(
  workspace: CaseWorkspaceDto
): CaseWorkspaceHealthSummary {
  return {
    sourceCount: workspace.sourceDocuments.length,
    factCount: workspace.facts.length,
    chronologyEventCount: workspace.chronologyEvents.length,
    issueCount: workspace.issues.length,
    highSeverityIssueCount: workspace.issues.filter((issue) => {
      return issue.severity === "high";
    }).length,
  };
}

export type CaseWorkspaceReadinessTone = "blocked" | "attention" | "ready";

export type CaseWorkspaceCurrentState = {
  readinessTone: CaseWorkspaceReadinessTone;
  readinessLabel: string;
  readinessDetail: string;
  openIssueCount: number;
  highSeverityIssueCount: number;
  contradictionCount: number;
  nextDeadlineAt: string | null;
  latestChange: CaseWorkspaceChronologyEventDto | null;
};

export type CaseWorkspaceAttentionItem = {
  id: string;
  label: string;
  title: string;
  detail: string | null;
  action: string | null;
  severity: CaseWorkspaceIssueSeverity;
  sourceSpanIds: string[];
};

export type CaseWorkspaceMomentumItem = {
  id: string;
  label: string;
  title: string;
  detail: string | null;
};

function compareIssuesByOperationalPriority(
  left: CaseWorkspaceIssueDto,
  right: CaseWorkspaceIssueDto
) {
  return (
    caseWorkspaceIssueSeverityRank[left.severity] -
      caseWorkspaceIssueSeverityRank[right.severity] ||
    left.detectedAt.localeCompare(right.detectedAt) * -1 ||
    left.title.localeCompare(right.title)
  );
}

function getOpenIssues(issues: CaseWorkspaceIssueDto[]) {
  return issues.filter((issue) => issue.status === "open");
}

function getLatestMeaningfulChange(
  events: CaseWorkspaceChronologyEventDto[]
): CaseWorkspaceChronologyEventDto | null {
  const meaningfulEvents = events.filter((event) => {
    return event.eventKind !== "deadline";
  });

  return [...meaningfulEvents].sort((left, right) => {
    return (right.occurredAt ?? "").localeCompare(left.occurredAt ?? "");
  })[0] ?? null;
}

export function getCaseWorkspaceCurrentState(
  workspace: CaseWorkspaceDto
): CaseWorkspaceCurrentState {
  const openIssues = getOpenIssues(workspace.issues);
  const highSeverityIssueCount = openIssues.filter((issue) => {
    return issue.severity === "high";
  }).length;
  const contradictionCount = openIssues.filter((issue) => {
    return issue.issueType === "contradiction";
  }).length;

  if (highSeverityIssueCount > 0 || contradictionCount > 0) {
    return {
      readinessTone: "blocked",
      readinessLabel: "Needs review before reliance",
      readinessDetail:
        "Resolve surfaced contradictions before using draft operational dates.",
      openIssueCount: openIssues.length,
      highSeverityIssueCount,
      contradictionCount,
      nextDeadlineAt: workspace.case.nextDeadlineAt,
      latestChange: getLatestMeaningfulChange(workspace.chronologyEvents),
    };
  }

  if (openIssues.length > 0) {
    return {
      readinessTone: "attention",
      readinessLabel: "Open items remain",
      readinessDetail:
        "The workspace is usable, with operational gaps still queued for review.",
      openIssueCount: openIssues.length,
      highSeverityIssueCount,
      contradictionCount,
      nextDeadlineAt: workspace.case.nextDeadlineAt,
      latestChange: getLatestMeaningfulChange(workspace.chronologyEvents),
    };
  }

  return {
    readinessTone: "ready",
    readinessLabel: "No surfaced blockers",
    readinessDetail:
      "Current source-backed records do not show unresolved operational issues.",
    openIssueCount: 0,
    highSeverityIssueCount: 0,
    contradictionCount: 0,
    nextDeadlineAt: workspace.case.nextDeadlineAt,
    latestChange: getLatestMeaningfulChange(workspace.chronologyEvents),
  };
}

export function getCaseWorkspaceAttentionItems(
  workspace: CaseWorkspaceDto,
  limit = 3
): CaseWorkspaceAttentionItem[] {
  return getOpenIssues(workspace.issues)
    .sort(compareIssuesByOperationalPriority)
    .slice(0, limit)
    .map((issue) => ({
      id: issue.id,
      label: caseWorkspaceIssueTypeLabels[issue.issueType],
      title: issue.title,
      detail: issue.description,
      action: issue.provenanceSummary,
      severity: issue.severity,
      sourceSpanIds: issue.sourceSpanIds,
    }));
}

export function getCaseWorkspaceMomentumItems(
  workspace: CaseWorkspaceDto
): CaseWorkspaceMomentumItem[] {
  const currentState = getCaseWorkspaceCurrentState(workspace);
  const attentionItems = getCaseWorkspaceAttentionItems(workspace, 2);
  const items: CaseWorkspaceMomentumItem[] = [];

  for (const attentionItem of attentionItems) {
    items.push({
      id: `issue-${attentionItem.id}`,
      label: attentionItem.label,
      title: attentionItem.title,
      detail: attentionItem.action ?? attentionItem.detail,
    });
  }

  if (workspace.case.nextAction) {
    items.push({
      id: "case-next-action",
      label: "Case queue",
      title: workspace.case.nextAction,
      detail: currentState.readinessDetail,
    });
  }

  if (workspace.case.nextDeadlineAt) {
    items.push({
      id: "case-next-deadline",
      label: "Deadline",
      title: "Protect the next dated obligation",
      detail: workspace.case.nextDeadlineAt,
    });
  }

  return items.slice(0, 3);
}
