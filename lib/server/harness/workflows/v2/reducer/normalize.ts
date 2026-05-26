import "server-only";

import type { CaseWorkspaceIssueDto } from "@/lib/contracts/case-workspace";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import type { HarnessBundle, ReviewGate } from "@/lib/contracts/harness";
import {
  type ReviewActionKind,
  type ReviewActionPriority,
  type ReviewActionRawRef,
  type ReviewActionRole,
  type ReviewReducerCandidate,
  reviewReducerCandidateSchema,
} from "@/lib/contracts/review-reducer";
import type { CaseWorkspaceRecords } from "@/lib/server/case-workspace/repository";

type BundleInput = {
  bundle: HarnessBundle;
  sourceKey: string;
};

function safeKey(...parts: string[]) {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function issueKind(issue: CaseWorkspaceIssueDto): ReviewActionKind {
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

function roleFromGate(gate: ReviewGate | null): ReviewActionRole {
  if (gate?.routedTo === "lawyer") {
    return "lawyer";
  }
  if (gate?.routedTo === "paralegal") {
    return "paralegal";
  }
  if (gate?.routedTo === "admin") {
    return "legal_ops";
  }

  return null;
}

function issueRole(issue: CaseWorkspaceIssueDto, gate: ReviewGate | null): ReviewActionRole {
  const gateRole = roleFromGate(gate);

  if (gateRole) {
    return gateRole;
  }
  if (issue.issueType === "contradiction") {
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

function issuePriority(
  issue: CaseWorkspaceIssueDto,
  gate: ReviewGate | null,
): ReviewActionPriority {
  if (gate?.level === "G3_hard_gate") {
    return "critical";
  }

  return issue.severity === "high" ? "high" : issue.severity;
}

function gateRawRef(input: {
  gate: ReviewGate;
  runId: string;
  sourceKey: string;
}): ReviewActionRawRef {
  return {
    id: [
      input.gate.targetType,
      input.gate.targetId,
      input.gate.level,
      input.gate.reasonCodes.join("-"),
    ].filter(Boolean).join(":"),
    key: input.gate.level,
    kind: "harness_gate",
    label: input.gate.reviewQuestion,
    runId: input.runId,
    sourceKey: input.sourceKey,
  };
}

function bundleRefs(input: {
  bundles: BundleInput[];
  issueKey: string;
  runId: string;
}) {
  for (const bundleInput of input.bundles) {
    const finding = bundleInput.bundle.findings.find((item) => {
      return safeKey("finding", item.id) === input.issueKey;
    });

    if (finding) {
      const gate = bundleInput.bundle.gates.find(
        (item) => item.targetType === "finding" && item.targetId === finding.id,
      ) ?? null;
      const refs: ReviewActionRawRef[] = [
        {
          id: finding.id,
          key: input.issueKey,
          kind: "harness_finding",
          label: finding.title,
          runId: input.runId,
          sourceKey: bundleInput.sourceKey,
        },
      ];

      if (gate) {
        refs.push(gateRawRef({ gate, runId: input.runId, sourceKey: bundleInput.sourceKey }));
      }

      return { gate, refs };
    }

    const conflict = bundleInput.bundle.conflicts.find((item) => {
      return safeKey("conflict", item.id) === input.issueKey;
    });

    if (conflict) {
      const gate = bundleInput.bundle.gates.find(
        (item) => item.targetType === "conflict" && item.targetId === conflict.id,
      ) ?? null;
      const refs: ReviewActionRawRef[] = [
        {
          id: conflict.id,
          key: input.issueKey,
          kind: "harness_conflict",
          label: conflict.field,
          runId: input.runId,
          sourceKey: bundleInput.sourceKey,
        },
      ];

      if (gate) {
        refs.push(gateRawRef({ gate, runId: input.runId, sourceKey: bundleInput.sourceKey }));
      }

      return { gate, refs };
    }
  }

  return { gate: null, refs: [] };
}

function workspaceIssueCandidate(input: {
  bundles: BundleInput[];
  issue: CaseWorkspaceIssueDto;
  runId: string;
}): ReviewReducerCandidate | null {
  const { gate, refs } = bundleRefs({
    bundles: input.bundles,
    issueKey: input.issue.issueKey,
    runId: input.runId,
  });

  if (refs.length === 0) {
    return null;
  }

  return reviewReducerCandidateSchema.parse({
    actionLabel: issueAction(input.issue),
    assignedRole: issueRole(input.issue, gate),
    blocking:
      input.issue.severity === "high" ||
      input.issue.issueType === "contradiction" ||
      Boolean(gate?.blocking),
    candidateKey: `workspace-issue:${input.issue.issueKey}`,
    kind: issueKind(input.issue),
    priority: issuePriority(input.issue, gate),
    rawRefs: [
      {
        id: input.issue.id,
        key: input.issue.issueKey,
        kind: "workspace_issue",
        label: input.issue.title,
        runId: input.runId,
        sourceKey: null,
      },
      ...refs,
    ],
    sourceSpanIds: input.issue.sourceSpanIds,
    summary:
      input.issue.description ??
      input.issue.provenanceSummary ??
      input.issue.title,
    title: input.issue.title,
  });
}

function revisionActionLabel(changeType: string) {
  if (changeType === "changed") {
    return "Compare versions";
  }

  return "Confirm current version";
}

function revisionCandidate(input: {
  claim: DocumentRevisionSummaryDto["claims"][number];
  summary: DocumentRevisionSummaryDto;
}) {
  const sourceSpanIds = [
    ...input.claim.beforeSourceSpanIds,
    ...input.claim.afterSourceSpanIds,
  ];
  const versionLabel = `${input.summary.fromVersionLabel} -> ${input.summary.toVersionLabel}`;

  return reviewReducerCandidateSchema.parse({
    actionLabel: revisionActionLabel(input.claim.changeType),
    assignedRole: "paralegal",
    blocking: false,
    candidateKey: `revision-claim:${input.claim.id}`,
    kind: "revision",
    priority: "medium",
    rawRefs: [
      {
        id: input.claim.id,
        key: input.claim.fieldPath,
        kind: "revision_claim",
        label: input.claim.fieldLabel,
        runId: null,
        sourceKey: input.summary.documentFamilyId,
      },
    ],
    sourceSpanIds: [...new Set(sourceSpanIds)].sort(),
    summary: `${input.claim.changeType} in ${versionLabel}: ${input.claim.fieldLabel}.`,
    title: input.claim.fieldLabel,
  });
}

export function normalizeReviewReducerCandidates(input: {
  bundles: BundleInput[];
  records: CaseWorkspaceRecords;
  revisionSummaries: DocumentRevisionSummaryDto[];
  runId: string;
}): ReviewReducerCandidate[] {
  const issueCandidates = input.records.issues
    .filter((issue) => issue.status === "open")
    .flatMap((issue) => {
      const candidate = workspaceIssueCandidate({
        bundles: input.bundles,
        issue,
        runId: input.runId,
      });

      return candidate ? [candidate] : [];
    });
  const revisionCandidates = input.revisionSummaries.flatMap((summary) =>
    summary.claims
      .filter((claim) => claim.status === "candidate")
      .map((claim) => revisionCandidate({ claim, summary })),
  );

  return [...issueCandidates, ...revisionCandidates];
}
