import { caseWorkspaceIssueTypeLabels } from "@/lib/case-workspace";
import type { CaseWorkspaceIssueDto } from "@/lib/contracts/case-workspace";
import type { ReviewActionRawRef } from "@/lib/contracts/review-reducer";
import {
  reviewWorkItemDraftSchema,
  type ReviewWorkItem,
  type ReviewWorkItemCore,
  type ReviewWorkItemDraft,
  type ReviewWorkItemFamily,
  type ReviewWorkItemPriority,
  type ReviewWorkItemProvenanceRef,
} from "@/lib/contracts/review-work-item";

const reviewWorkItemPriorityRank = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} satisfies Record<ReviewWorkItemPriority, number>;

const rawRefKinds = new Set([
  "workspace_issue",
  "harness_finding",
  "harness_conflict",
  "harness_gate",
  "revision_claim",
]);

const issueFamilies: Partial<
  Record<CaseWorkspaceIssueDto["issueType"], ReviewWorkItemFamily>
> = {
  chronology_gap: "timeline",
  contradiction: "conflict",
  revision_drift: "revision",
};

const issueReviewPrompts: Partial<Record<CaseWorkspaceIssueDto["issueType"], string>> = {
  chronology_gap: "Place in timeline",
  contradiction: "Choose controlling source",
  revision_drift: "Check current version",
};

export function rawRefToProvenanceRef(
  ref: ReviewActionRawRef,
): ReviewWorkItemProvenanceRef {
  return {
    key: ref.key,
    kind: ref.kind,
    label: ref.label,
    ref: ref.id,
    runId: ref.runId,
    sourceKey: ref.sourceKey,
  };
}

export function provenanceRefsToRawRefs(
  refs: ReviewWorkItemProvenanceRef[],
): ReviewActionRawRef[] {
  return refs.flatMap((ref) => {
    if (!rawRefKinds.has(ref.kind)) {
      return [];
    }

    return [{
      id: ref.ref,
      key: ref.key,
      kind: ref.kind as ReviewActionRawRef["kind"],
      label: ref.label,
      runId: ref.runId,
      sourceKey: ref.sourceKey,
    }];
  });
}

export function sourceSpanProvenanceRefs(sourceSpanIds: string[]) {
  return sourceSpanIds.map((sourceSpanId) => ({
    key: null,
    kind: "source_span",
    label: null,
    ref: sourceSpanId,
    runId: null,
    sourceKey: null,
  }));
}

function issueFamily(issue: CaseWorkspaceIssueDto): ReviewWorkItemFamily {
  return issueFamilies[issue.issueType] ?? "missing";
}

function issueReviewPrompt(issue: CaseWorkspaceIssueDto) {
  return issueReviewPrompts[issue.issueType] ?? "Find support";
}

function issuePriority(
  issue: CaseWorkspaceIssueDto,
): ReviewWorkItemPriority {
  return issue.severity === "high" ? "high" : issue.severity;
}

export function reviewWorkItemFromIssue(
  issue: CaseWorkspaceIssueDto,
): ReviewWorkItem {
  const family = issueFamily(issue);

  return {
    blocking: issue.severity === "high" || issue.issueType === "contradiction",
    caseId: issue.caseId,
    createdAt: issue.createdAt,
    id: issue.id,
    key: issue.issueKey,
    kind: {
      code: issue.issueType,
      family,
    },
    origin: {
      sourceRunId: null,
      sourceType: "workspace_issue",
    },
    priority: issuePriority(issue),
    provenanceRefs: [
      {
        key: issue.issueKey,
        kind: "workspace_issue",
        label: issue.title,
        ref: issue.id,
        runId: null,
        sourceKey: null,
      },
      ...issue.relatedFactIds.map((factId) => ({
        key: null,
        kind: "fact",
        label: null,
        ref: factId,
        runId: null,
        sourceKey: null,
      })),
      ...issue.relatedEventIds.map((eventId) => ({
        key: null,
        kind: "chronology_event",
        label: null,
        ref: eventId,
        runId: null,
        sourceKey: null,
      })),
      ...sourceSpanProvenanceRefs(issue.sourceSpanIds),
    ],
    resolvedAt: issue.status === "open" ? null : issue.updatedAt,
    reviewPrompt: issueReviewPrompt(issue),
    sourceSpanIds: issue.sourceSpanIds,
    status: issue.status === "reviewed" ? "resolved" : issue.status,
    summary:
      issue.description ??
      issue.provenanceSummary ??
      caseWorkspaceIssueTypeLabels[issue.issueType],
    title: issue.title,
    updatedAt: issue.updatedAt,
  };
}

export function reviewWorkItemDraft(input: {
  blocking: boolean;
  key: string;
  kind: ReviewWorkItemFamily;
  priority: ReviewWorkItemPriority;
  provenanceRefs: ReviewWorkItemProvenanceRef[];
  reviewPrompt: string;
  sourceRunId: string | null;
  sourceSpanIds: string[];
  summary: string;
  title: string;
}): ReviewWorkItemDraft {
  return reviewWorkItemDraftSchema.parse({
    blocking: input.blocking,
    key: input.key,
    kind: {
      code: input.kind,
      family: input.kind,
    },
    origin: {
      sourceRunId: input.sourceRunId,
      sourceType: "review_reducer",
    },
    priority: input.priority,
    provenanceRefs: input.provenanceRefs,
    reviewPrompt: input.reviewPrompt,
    sourceSpanIds: input.sourceSpanIds,
    status: "open",
    summary: input.summary,
    title: input.title,
  });
}

export function compareReviewWorkItems(
  left: Pick<ReviewWorkItem, "blocking" | "priority" | "title" | "updatedAt">,
  right: Pick<ReviewWorkItem, "blocking" | "priority" | "title" | "updatedAt">,
) {
  return (
    reviewWorkItemPriorityRank[left.priority] -
      reviewWorkItemPriorityRank[right.priority] ||
    Number(right.blocking) - Number(left.blocking) ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.title.localeCompare(right.title)
  );
}

export function reviewWorkItemOperationKey(item: ReviewWorkItemCore) {
  return `review_action:${item.key}`;
}
