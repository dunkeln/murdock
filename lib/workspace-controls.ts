import {
  type ControlAction,
  type ControlStatus,
  type WorkspaceControlState,
  controlActionSchema,
  workspaceControlStateSchema,
} from "@/lib/agui";
import {
  getCaseWorkspaceAttentionItems,
  summarizeCaseWorkspace,
} from "@/lib/case-workspace";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";

export function buildWorkspaceActions(
  workspace: CaseWorkspaceDto,
): ControlAction[] {
  const attentionActions = getCaseWorkspaceAttentionItems(workspace, 3).map(
    (item) =>
      controlActionSchema.parse({
        id: `issue:${item.id}`,
        kind: item.sourceSpanIds.length > 0 ? "inspect_provenance" : "review_issue",
        label: item.label,
        title: item.title,
        detail: item.action,
        severity: item.severity,
        issueType: workspace.issues.find((issue) => issue.id === item.id)
          ?.issueType ?? null,
        relatedIssueId: item.id,
        sourceSpanIds: item.sourceSpanIds,
      }),
  );

  if (attentionActions.length > 0) {
    return attentionActions;
  }

  return [
    controlActionSchema.parse({
      id: "review:facts",
      kind: "review_facts",
      label: "Review",
      title: "Review extracted case register",
      detail:
        workspace.facts.length > 0
          ? "Confirm the current source-backed facts before moving work forward."
          : "No facts have been shaped yet.",
      severity: null,
      issueType: null,
      relatedIssueId: null,
      sourceSpanIds: workspace.sourceSpans.slice(0, 3).map((span) => span.id),
    }),
  ];
}

export function buildWorkspaceState(input: {
  status: ControlStatus;
  workspace: CaseWorkspaceDto;
}): WorkspaceControlState {
  return workspaceControlStateSchema.parse({
    caseId: input.workspace.case.id,
    status: input.status,
    summary: summarizeCaseWorkspace(input.workspace),
    actions: buildWorkspaceActions(input.workspace),
    updatedAt: new Date().toISOString(),
  });
}
