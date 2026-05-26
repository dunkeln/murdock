import "server-only";

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  REVIEW_REDUCER_SCHEMA_NAME,
  REVIEW_REDUCER_VERSION,
  type MaterializedReviewAction,
  type ReviewReducerCandidate,
  type ReviewReducerRunStatus,
  reviewReducerModelOutputSchema,
} from "@/lib/contracts/review-reducer";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import { generateObject } from "@/lib/server/ai/generate-object";
import type { CaseWorkspaceRecords } from "@/lib/server/case-workspace/repository";
import type { HarnessBundleResult } from "@/lib/server/workflows/shape/project";

import {
  fallbackReviewActions,
  materializeModelReviewActions,
} from "./materialize";
import { normalizeReviewReducerCandidates } from "./normalize";
import {
  finishReviewReducerRun,
  startReviewReducerRun,
  upsertReviewActions,
} from "./repository";

const promptPath = join(process.cwd(), "prompts", "review-reducer-v1.md");
const MAX_REVIEW_REDUCER_CANDIDATES = 64;
let promptTextPromise: Promise<string> | null = null;

const priorityRank = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} satisfies Record<ReviewReducerCandidate["priority"], number>;

const kindRank = {
  conflict: 0,
  missing: 1,
  timeline: 2,
  revision: 3,
  source_check: 4,
} satisfies Record<ReviewReducerCandidate["kind"], number>;

function loadPromptText() {
  promptTextPromise ??= readFile(promptPath, "utf8");

  return promptTextPromise;
}

function trimExcerpt(value: string) {
  return value.length > 320 ? `${value.slice(0, 317)}...` : value;
}

function reducerInputPayload(input: {
  candidates: ReturnType<typeof normalizeReviewReducerCandidates>;
  records: CaseWorkspaceRecords;
}) {
  const usedSpanIds = new Set(
    input.candidates.flatMap((candidate) => candidate.sourceSpanIds),
  );

  return {
    reviewCandidates: input.candidates.map((candidate) => ({
      actionLabel: candidate.actionLabel,
      assignedRole: candidate.assignedRole,
      blocking: candidate.blocking,
      candidateKey: candidate.candidateKey,
      kind: candidate.kind,
      priority: candidate.priority,
      sourceSpanIds: candidate.sourceSpanIds,
      summary: candidate.summary,
      title: candidate.title,
    })),
    sourceSpans: input.records.sourceSpans
      .filter((span) => usedSpanIds.has(span.id))
      .map((span) => ({
        documentId: span.sourceDocumentId,
        id: span.id,
        page: span.pageLabel,
        quote: trimExcerpt(span.verbatimExcerpt),
      })),
  };
}

function userMessage(input: {
  candidates: ReturnType<typeof normalizeReviewReducerCandidates>;
  caseId: string;
  records: CaseWorkspaceRecords;
}) {
  const payload = reducerInputPayload({
    candidates: input.candidates,
    records: input.records,
  });

  return [
    "<case_context>",
    JSON.stringify({ caseId: input.caseId }),
    "</case_context>",
    "<review_candidates>",
    JSON.stringify(payload.reviewCandidates),
    "</review_candidates>",
    "<source_spans>",
    JSON.stringify(payload.sourceSpans),
    "</source_spans>",
  ].join("\n");
}

function fallbackError(message: string, detail?: unknown) {
  return {
    detail,
    isError: true,
    message,
  };
}

function shouldUseModelReducer() {
  return process.env.HARNESS_REVIEW_REDUCER_LLM === "1";
}

export function selectReviewReducerCandidates(
  candidates: ReviewReducerCandidate[],
) {
  return [...candidates]
    .sort(
      (left, right) =>
        priorityRank[left.priority] - priorityRank[right.priority] ||
        Number(right.blocking) - Number(left.blocking) ||
        kindRank[left.kind] - kindRank[right.kind] ||
        left.title.localeCompare(right.title) ||
        left.candidateKey.localeCompare(right.candidateKey),
    )
    .slice(0, MAX_REVIEW_REDUCER_CANDIDATES);
}

export type ReviewReducerWorkflowResult = {
  actions: MaterializedReviewAction[];
  candidateCount: number;
  fallback: boolean;
  reducerRunId: string;
  status: Exclude<ReviewReducerRunStatus, "running">;
  validationErrors: string[];
};

export async function reduceHarnessV2ReviewActions(input: {
  bundles: HarnessBundleResult[];
  caseId: string;
  harnessRunId: string;
  records: CaseWorkspaceRecords;
  revisionSummaries: DocumentRevisionSummaryDto[];
}): Promise<ReviewReducerWorkflowResult> {
  const requestedReducerRunId = randomUUID();
  const reducerRunId = await startReviewReducerRun({
    caseId: input.caseId,
    harnessRunId: input.harnessRunId,
    reducerVersion: REVIEW_REDUCER_VERSION,
    runId: requestedReducerRunId,
  });
  const candidates = selectReviewReducerCandidates(normalizeReviewReducerCandidates({
    bundles: input.bundles.map((bundle) => ({
      bundle: bundle.bundle,
      sourceKey: bundle.source.sourceKey,
    })),
    records: input.records,
    revisionSummaries: input.revisionSummaries,
    runId: input.harnessRunId,
  }));

  if (candidates.length === 0) {
    await finishReviewReducerRun({
      runId: reducerRunId,
      stats: { actionCount: 0, candidateCount: 0 },
      status: "succeeded",
    });

    return {
      actions: [],
      candidateCount: 0,
      fallback: false,
      reducerRunId,
      status: "succeeded",
      validationErrors: [],
    };
  }

  if (!shouldUseModelReducer()) {
    const actions = fallbackReviewActions(candidates);

    await upsertReviewActions({ actions, caseId: input.caseId, reducerRunId });
    await finishReviewReducerRun({
      runId: reducerRunId,
      stats: {
        actionCount: actions.length,
        candidateCount: candidates.length,
        deterministic: true,
      },
      status: "succeeded",
    });

    return {
      actions,
      candidateCount: candidates.length,
      fallback: false,
      reducerRunId,
      status: "succeeded",
      validationErrors: [],
    };
  }

  const promptText = await loadPromptText();
  const result = await generateObject({
    maxOutputTokens: 4096,
    messages: [
      {
        role: "user",
        content: userMessage({
          candidates,
          caseId: input.caseId,
          records: input.records,
        }),
      },
    ],
    schema: reviewReducerModelOutputSchema,
    schemaName: REVIEW_REDUCER_SCHEMA_NAME,
    system: promptText,
    temperature: 0,
    use: "review-reducer",
  });

  if (!result.ok) {
    const actions = fallbackReviewActions(candidates);
    await upsertReviewActions({ actions, caseId: input.caseId, reducerRunId });
    await finishReviewReducerRun({
      error: fallbackError("Review reducer model failed.", result.error),
      runId: reducerRunId,
      stats: {
        actionCount: actions.length,
        candidateCount: candidates.length,
        fallback: true,
      },
      status: "fallback",
    });

    return {
      actions,
      candidateCount: candidates.length,
      fallback: true,
      reducerRunId,
      status: "fallback",
      validationErrors: [result.error.message],
    };
  }

  const materialized = materializeModelReviewActions({
    candidates,
    modelActions: result.data.actions,
  });

  if (!materialized.ok) {
    const actions = fallbackReviewActions(candidates);
    await upsertReviewActions({ actions, caseId: input.caseId, reducerRunId });
    await finishReviewReducerRun({
      error: fallbackError("Review reducer output failed validation.", materialized.errors),
      model: result.model,
      provider: result.provider,
      runId: reducerRunId,
      stats: {
        actionCount: actions.length,
        candidateCount: candidates.length,
        fallback: true,
        validationErrorCount: materialized.errors.length,
      },
      status: "fallback",
      usage: result.usage,
    });

    return {
      actions,
      candidateCount: candidates.length,
      fallback: true,
      reducerRunId,
      status: "fallback",
      validationErrors: materialized.errors,
    };
  }

  await upsertReviewActions({
    actions: materialized.actions,
    caseId: input.caseId,
    reducerRunId,
  });
  await finishReviewReducerRun({
    model: result.model,
    provider: result.provider,
    runId: reducerRunId,
    stats: {
      actionCount: materialized.actions.length,
      candidateCount: candidates.length,
      fallback: false,
    },
    status: "succeeded",
    usage: result.usage,
  });

  return {
    actions: materialized.actions,
    candidateCount: candidates.length,
    fallback: false,
    reducerRunId,
    status: "succeeded",
    validationErrors: [],
  };
}
