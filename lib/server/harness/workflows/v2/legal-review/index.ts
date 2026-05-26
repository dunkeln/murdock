import "server-only";

import type { Finding } from "@/lib/contracts/harness";
import { compileDraft, type RawDraft } from "@/lib/server/harness/workflows/v1/draft";
import type { SourceMap } from "@/lib/server/harness/workflows/v1/source";

import { buildLegalReviewFormState } from "./form-state";
import { reviewCaUd100 } from "./rules/ca-ud-100";
import type { LegalReviewCandidate } from "./types";

function toFinding(input: {
  candidate: LegalReviewCandidate;
  index: number;
  source: SourceMap;
}) {
  const doc = input.source.docs[0];

  if (!doc) {
    return null;
  }

  const raw: RawDraft = {
    importance: input.candidate.importance,
    note: input.candidate.note,
    problem: input.candidate.problem,
    sourceSpanIds: input.candidate.sourceSpanIds,
    title: input.candidate.title,
    type: input.candidate.type,
  };

  return compileDraft({
    doc,
    index: 10_000 + input.index,
    raw,
    segment: {
      index: 0,
      spans: input.source.sourceSpans,
      text: input.source.fullText,
    },
  });
}

export function compileHarnessV2LegalReview(input: {
  annotation: unknown;
  source: SourceMap;
}): Finding[] {
  const formState = buildLegalReviewFormState(input);
  const candidates = reviewCaUd100(formState);

  return candidates.flatMap((candidate, index) => {
    const finding = toFinding({ candidate, index, source: input.source });

    return finding ? [finding] : [];
  });
}
