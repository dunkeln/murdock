import { describe, expect, it } from "vitest";

import type { HarnessBundle } from "@/lib/contracts/harness";
import {
  type ReviewReducerCandidate,
  reviewReducerCandidateSchema,
} from "@/lib/contracts/review-reducer";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import type { CaseWorkspaceRecords } from "@/lib/server/case-workspace/repository";
import {
  fallbackReviewActions,
  materializeModelReviewActions,
} from "@/lib/server/harness/workflows/v2/reducer/materialize";
import { normalizeReviewReducerCandidates } from "@/lib/server/harness/workflows/v2/reducer/normalize";
import { selectReviewReducerCandidates } from "@/lib/server/harness/workflows/v2/reducer/workflow";

const caseId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const sourceDocumentId = "33333333-3333-4333-8333-333333333333";
const sourceSpanId = "44444444-4444-4444-8444-444444444444";
const sourceSpanId2 = "55555555-5555-4555-8555-555555555555";
const issueId = "66666666-6666-4666-8666-666666666666";
const now = "2026-02-01T19:20:00.000Z";

function records(): CaseWorkspaceRecords {
  return {
    chronologyEvents: [],
    facts: [],
    issues: [
      {
        caseId,
        createdAt: now,
        description: "The answer has no defendant signature in the cited section.",
        detectedAt: now,
        id: issueId,
        issueKey: "finding-signature-gap",
        issueType: "missing_context",
        provenanceSummary: "Signature source span is blank.",
        relatedEventIds: [],
        relatedFactIds: [],
        severity: "high",
        sourceSpanIds: [sourceSpanId],
        status: "open",
        title: "Defendant signature not populated",
        updatedAt: now,
      },
    ],
    reviewActions: [],
    sourceDocuments: [
      {
        caseDocumentId: null,
        caseId,
        createdAt: now,
        documentSha256: null,
        fileName: "ud-105.pdf",
        id: sourceDocumentId,
        mimeType: "application/pdf",
        ocrConversionId: null,
        ocrStatus: "ready",
        receivedAt: now,
        sizeBytes: 100,
        sourceDate: null,
        sourceKey: "ocr-source",
        sourceKind: "pleading",
        title: "UD-105",
        updatedAt: now,
      },
    ],
    sourceSpans: [
      {
        capturedAt: now,
        caseId,
        confidence: 0.92,
        createdAt: now,
        fieldPath: "answer.signature",
        id: sourceSpanId,
        pageIndex: 0,
        pageLabel: "1",
        sourceDocumentId,
        spanKey: "signature",
        updatedAt: now,
        verbatimExcerpt: "Signature of defendant:",
      },
    ],
  };
}

function bundle(): HarnessBundle {
  return {
    conflicts: [],
    docs: [
      {
        caseId,
        fileName: "ud-105.pdf",
        id: "doc-1",
        ocrConversionId: "77777777-7777-4777-8777-777777777777",
        pageCount: 1,
        provider: "mistral",
        providerModel: "mistral-ocr-latest",
        sha256: null,
      },
    ],
    findings: [
      {
        confidenceBasis: {
          ambiguity: "material",
          ocrQuality: "good",
          sourceQuality: "partial",
        },
        evidenceQuality: "partial",
        id: "signature-gap",
        kind: "missing_info",
        materiality: "critical",
        normalizedValue: null,
        originalText: "Signature of defendant:",
        sourceSpans: [
          {
            bbox: null,
            charEnd: 24,
            charStart: 0,
            docId: "doc-1",
            id: "span-1",
            ocrConfidence: 98,
            page: 1,
            quote: "Signature of defendant:",
          },
        ],
        status: "missing",
        summary: "The defendant signature section is blank.",
        title: "Defendant signature not populated",
        type: "signature_gap",
        unresolvedQuestions: [],
      },
    ],
    gates: [
      {
        blocking: true,
        level: "G3_hard_gate",
        reasonCodes: ["missing_or_unclear"],
        reviewQuestion: "Can the answer be filed without a defendant signature?",
        routedTo: "lawyer",
        targetId: "signature-gap",
        targetType: "finding",
      },
    ],
    resolutions: [],
    sourceSpans: [],
    stats: {
      conflictCount: 0,
      docCount: 1,
      findingCount: 1,
      gateCount: 1,
      spanCount: 1,
    },
    version: "harness.v1",
  };
}

function candidate(input: Partial<ReviewReducerCandidate> = {}) {
  return reviewReducerCandidateSchema.parse({
    actionLabel: "Find support",
    assignedRole: "paralegal",
    blocking: false,
    candidateKey: "candidate-a",
    kind: "missing",
    priority: "medium",
    rawRefs: [
      {
        id: issueId,
        key: "finding-signature-gap",
        kind: "workspace_issue",
        label: "Defendant signature not populated",
        runId,
        sourceKey: null,
      },
    ],
    sourceSpanIds: [sourceSpanId],
    summary: "Signature support needs review.",
    title: "Signature missing",
    ...input,
  });
}

function revisionSummary(): DocumentRevisionSummaryDto {
  return {
    claims: [
      {
        afterSourceSpanIds: [sourceSpanId2],
        afterValue: "Jane Tenant",
        beforeSourceSpanIds: [sourceSpanId],
        beforeValue: null,
        caseId,
        changeType: "changed",
        confidence: "high",
        createdAt: now,
        documentFamilyId: "77777777-7777-4777-8777-777777777777",
        fieldLabel: "Defendant name",
        fieldPath: "parties.defendant.name",
        fromDocumentVersionId: "88888888-8888-4888-8888-888888888888",
        id: "99999999-9999-4999-8999-999999999999",
        status: "candidate",
        toDocumentVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        updatedAt: now,
      },
    ],
    documentFamilyId: "77777777-7777-4777-8777-777777777777",
    documentLabel: "UD-105",
    fromSourceDocumentId: sourceDocumentId,
    fromVersionLabel: "UD-105 v1",
    toSourceDocumentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    toVersionLabel: "UD-105 v2",
  };
}

describe("review reducer normalization", () => {
  it("preserves G3 gates, raw refs, source spans, and lawyer routing", () => {
    const [reducedCandidate] = normalizeReviewReducerCandidates({
      bundles: [{ bundle: bundle(), sourceKey: "ocr-source" }],
      records: records(),
      revisionSummaries: [],
      runId,
    });

    expect(reducedCandidate).toMatchObject({
      assignedRole: "lawyer",
      blocking: true,
      candidateKey: "workspace-issue:finding-signature-gap",
      priority: "critical",
    });
    expect(reducedCandidate?.sourceSpanIds).toEqual([sourceSpanId]);
    expect(reducedCandidate?.rawRefs.map((ref) => ref.kind)).toEqual([
      "workspace_issue",
      "harness_finding",
      "harness_gate",
    ]);
  });

  it("adds revision claims as reducer candidates without resolving them", () => {
    const candidates = normalizeReviewReducerCandidates({
      bundles: [],
      records: { ...records(), issues: [] },
      revisionSummaries: [revisionSummary()],
      runId,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      actionLabel: "Compare versions",
      candidateKey: "revision-claim:99999999-9999-4999-8999-999999999999",
      kind: "revision",
      title: "Defendant name",
    });
    expect(candidates[0]?.sourceSpanIds).toEqual([sourceSpanId, sourceSpanId2]);
  });

  it("omits stale workspace issues that are not backed by the current harness bundle", () => {
    const candidates = normalizeReviewReducerCandidates({
      bundles: [],
      records: records(),
      revisionSummaries: [],
      runId,
    });

    expect(candidates).toHaveLength(0);
  });
});

describe("review reducer candidate selection", () => {
  it("keeps the highest-risk candidates within the reducer budget", () => {
    const candidates = Array.from({ length: 70 }, (_, index) =>
      candidate({
        blocking: index === 69,
        candidateKey: `candidate-${index}`,
        priority: index === 69 ? "critical" : "low",
        title: `Candidate ${index}`,
      }),
    );
    const selected = selectReviewReducerCandidates(candidates);

    expect(selected).toHaveLength(64);
    expect(selected[0]).toMatchObject({
      candidateKey: "candidate-69",
      priority: "critical",
    });
  });
});

describe("review reducer materialization", () => {
  it("groups candidates while keeping the strongest legal routing and provenance", () => {
    const candidates = [
      candidate({
        candidateKey: "candidate-a",
        priority: "medium",
        sourceSpanIds: [sourceSpanId],
      }),
      candidate({
        assignedRole: "lawyer",
        blocking: true,
        candidateKey: "candidate-b",
        priority: "critical",
        sourceSpanIds: [sourceSpanId2],
        title: "Second signature gap",
      }),
    ];
    const result = materializeModelReviewActions({
      candidates,
      modelActions: [
        {
          actionLabel: "Resolve signature gaps",
          assignedRole: "paralegal",
          blocking: false,
          candidateKeys: ["candidate-a", "candidate-b"],
          kind: "missing",
          priority: "medium",
          summary: "Review the grouped signature gaps on the answer.",
          title: "Answer signature gaps",
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      actionLabel: "Resolve signature gaps",
      assignedRole: "lawyer",
      blocking: true,
      priority: "critical",
    });
    expect(result.actions[0]?.sourceSpanIds).toEqual([sourceSpanId, sourceSpanId2]);
    expect(result.actions[0]?.rawRefs).toHaveLength(1);
  });

  it("rejects omitted candidates so callers can persist raw fallback actions", () => {
    const candidates = [
      candidate({ candidateKey: "candidate-a" }),
      candidate({ candidateKey: "candidate-b" }),
    ];
    const result = materializeModelReviewActions({
      candidates,
      modelActions: [
        {
          actionLabel: "Review one issue",
          assignedRole: "paralegal",
          blocking: false,
          candidateKeys: ["candidate-a"],
          kind: "missing",
          priority: "medium",
          summary: "Only one candidate was returned.",
          title: "Partial reducer output",
        },
      ],
    });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) {
      return;
    }
    expect(result.errors[0]).toContain("Reducer omitted candidates");
    expect(fallbackReviewActions(candidates)).toHaveLength(2);
  });
});
