import "server-only";

import type { Finding } from "@/lib/contracts/harness";
import {
  harnessV2DocumentAnnotationSchema,
  type HarnessV2AnnotationCandidate,
} from "@/lib/contracts/harness-v2";
import { compileDraft } from "@/lib/server/harness/workflows/v1/draft";
import type { SourceMap } from "@/lib/server/harness/workflows/v1/source";

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function quoteMatchesSpan(input: { quote: string; spanQuote: string }) {
  const quote = normalizeText(input.quote);
  const spanQuote = normalizeText(input.spanQuote);

  return Boolean(
    quote &&
      spanQuote &&
      (spanQuote.includes(quote) || quote.includes(spanQuote)),
  );
}

function sourceSpanIdsForCandidate(input: {
  candidate: HarnessV2AnnotationCandidate;
  source: SourceMap;
}) {
  const ids = new Set<string>();

  for (const sourceQuote of input.candidate.sourceQuotes) {
    for (const span of input.source.sourceSpans) {
      if (quoteMatchesSpan({ quote: sourceQuote, spanQuote: span.quote })) {
        ids.add(span.id);
      }
    }
  }

  return [...ids];
}

export function compileHarnessV2Annotation(input: {
  annotation: unknown;
  source: SourceMap;
}): Finding[] {
  const annotation = harnessV2DocumentAnnotationSchema.parse(input.annotation);
  const doc = input.source.docs[0];

  if (!doc) {
    return [];
  }

  return annotation.candidates.map((candidate, index) =>
    compileDraft({
      doc,
      index,
      raw: {
        ...candidate,
        sourceSpanIds: sourceSpanIdsForCandidate({
          candidate,
          source: input.source,
        }),
      },
      segment: {
        index: 0,
        spans: input.source.sourceSpans,
        text: input.source.fullText,
      },
    }),
  );
}
