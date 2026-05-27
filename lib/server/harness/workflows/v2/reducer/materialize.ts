import "server-only";

import { createHash } from "node:crypto";

import {
  type MaterializedReviewAction,
  type ReviewActionKind,
  type ReviewActionPriority,
  type ReviewActionRawRef,
  type ReviewReducerCandidate,
  type ReviewReducerModelAction,
} from "@/lib/contracts/review-reducer";
import {
  rawRefToProvenanceRef,
  reviewWorkItemDraft,
} from "@/lib/review-work-items";

const priorityRank = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} satisfies Record<ReviewActionPriority, number>;

function stableActionKey(candidateKeys: string[]) {
  const hash = createHash("sha256")
    .update([...candidateKeys].sort().join("|"))
    .digest("hex")
    .slice(0, 24);

  return `review-action-${hash}`;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function rawRefKey(ref: ReviewActionRawRef) {
  return [
    ref.kind,
    ref.id,
    ref.key ?? "",
    ref.runId ?? "",
    ref.sourceKey ?? "",
  ].join(":");
}

function uniqueRawRefs(candidates: ReviewReducerCandidate[]) {
  const refs = new Map<string, ReviewActionRawRef>();

  for (const ref of candidates.flatMap((candidate) => candidate.rawRefs)) {
    refs.set(rawRefKey(ref), ref);
  }

  return [...refs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, ref]) => ref);
}

function strongestPriority(
  modelPriority: ReviewActionPriority,
  candidates: ReviewReducerCandidate[],
) {
  return [modelPriority, ...candidates.map((candidate) => candidate.priority)]
    .sort((left, right) => priorityRank[left] - priorityRank[right])[0]!;
}

function strongestKind(
  modelKind: ReviewActionKind,
  candidates: ReviewReducerCandidate[],
) {
  if (candidates.some((candidate) => candidate.kind === "conflict")) {
    return "conflict";
  }
  if (candidates.some((candidate) => candidate.kind === "revision")) {
    return "revision";
  }
  if (candidates.some((candidate) => candidate.kind === "timeline")) {
    return "timeline";
  }
  if (candidates.some((candidate) => candidate.kind === "source_check")) {
    return "source_check";
  }

  return modelKind;
}

function materializeAction(input: {
  sourceRunId: string | null;
  candidateKeys: string[];
  candidates: ReviewReducerCandidate[];
  modelAction: Omit<ReviewReducerModelAction, "candidateKeys">;
}): MaterializedReviewAction {
  return reviewWorkItemDraft({
    blocking:
      input.modelAction.blocking ||
      input.candidates.some((candidate) => candidate.blocking),
    key: stableActionKey(input.candidateKeys),
    kind: strongestKind(input.modelAction.kind, input.candidates),
    priority: strongestPriority(input.modelAction.priority, input.candidates),
    provenanceRefs: uniqueRawRefs(input.candidates).map(rawRefToProvenanceRef),
    reviewPrompt: input.modelAction.actionLabel,
    sourceRunId: input.sourceRunId,
    sourceSpanIds: uniqueSorted(
      input.candidates.flatMap((candidate) => candidate.sourceSpanIds),
    ),
    summary: input.modelAction.summary,
    title: input.modelAction.title,
  });
}

export function fallbackReviewActions(
  candidates: ReviewReducerCandidate[],
): MaterializedReviewAction[] {
  return candidates.map((candidate) =>
    reviewWorkItemDraft({
      blocking: candidate.blocking,
      key: stableActionKey([candidate.candidateKey]),
      kind: candidate.kind,
      priority: candidate.priority,
      provenanceRefs: candidate.rawRefs.map(rawRefToProvenanceRef),
      reviewPrompt: candidate.actionLabel,
      sourceRunId: candidate.rawRefs[0]?.runId ?? null,
      sourceSpanIds: uniqueSorted(candidate.sourceSpanIds),
      summary: candidate.summary,
      title: candidate.title,
    }),
  );
}

export function materializeModelReviewActions(input: {
  candidates: ReviewReducerCandidate[];
  modelActions: ReviewReducerModelAction[];
}):
  | { actions: MaterializedReviewAction[]; ok: true }
  | { errors: string[]; ok: false } {
  const byKey = new Map(
    input.candidates.map((candidate) => [candidate.candidateKey, candidate]),
  );
  const covered = new Set<string>();
  const errors: string[] = [];
  const actions: MaterializedReviewAction[] = [];

  for (const modelAction of input.modelActions) {
    const candidateKeys = uniqueSorted(modelAction.candidateKeys);
    const candidates = candidateKeys.flatMap((candidateKey) => {
      const candidate = byKey.get(candidateKey);

      if (!candidate) {
        errors.push(`Unknown reducer candidate: ${candidateKey}`);
        return [];
      }

      if (covered.has(candidateKey)) {
        errors.push(`Duplicate reducer candidate: ${candidateKey}`);
      }

      return [candidate];
    });

    if (candidates.length === 0) {
      errors.push(`Reducer action has no valid candidates: ${modelAction.title}`);
      continue;
    }

    for (const candidateKey of candidateKeys) {
      covered.add(candidateKey);
    }

    actions.push(
      materializeAction({
        candidateKeys,
        candidates,
        modelAction,
        sourceRunId:
          candidates.find((candidate) => candidate.rawRefs[0]?.runId)?.rawRefs[0]
            ?.runId ?? null,
      }),
    );
  }

  if (covered.size !== input.candidates.length) {
    const missing = input.candidates
      .map((candidate) => candidate.candidateKey)
      .filter((candidateKey) => !covered.has(candidateKey));

    errors.push(`Reducer omitted candidates: ${missing.join(", ")}`);
  }

  return errors.length > 0 ? { errors, ok: false } : { actions, ok: true };
}
