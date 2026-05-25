import "server-only";

import type { SourceSpan } from "@/lib/contracts/harness";
import type { SourceMap } from "@/lib/server/harness/workflows/v1/source";

export type Budget = {
  maxChars: number;
  maxNumbers: number;
  maxPages: number;
  maxSpans: number;
  maxTableCells: number;
};

export type Segment = {
  index: number;
  spans: SourceSpan[];
  text: string;
};

export const defaultBudget: Budget = {
  maxChars: 12000,
  maxNumbers: 120,
  maxPages: 5,
  maxSpans: 80,
  maxTableCells: 150,
};

type Metrics = {
  chars: number;
  numbers: number;
  pages: Set<number>;
  spans: number;
  tableCells: number;
};

function metrics(): Metrics {
  return { chars: 0, numbers: 0, pages: new Set(), spans: 0, tableCells: 0 };
}

function numbers(value: string) {
  return value.match(/(?:[$€£])?\d[\d,]*(?:\.\d+)?%?/g)?.length ?? 0;
}

function tableCells(value: string) {
  return value
    .split("\n")
    .filter((line) => line.includes("|"))
    .reduce((count, line) => count + line.split("|").filter(Boolean).length, 0);
}

function add(metricsInput: Metrics, span: SourceSpan) {
  metricsInput.chars += span.quote.length;
  metricsInput.numbers += numbers(span.quote);
  metricsInput.pages.add(span.page);
  metricsInput.spans += 1;
  metricsInput.tableCells += tableCells(span.quote);
}

function over(metricsInput: Metrics, budget: Budget) {
  return (
    metricsInput.chars > budget.maxChars ||
    metricsInput.numbers > budget.maxNumbers ||
    metricsInput.pages.size > budget.maxPages ||
    metricsInput.spans > budget.maxSpans ||
    metricsInput.tableCells > budget.maxTableCells
  );
}

function makeSegment(index: number, spans: SourceSpan[]): Segment {
  return {
    index,
    spans,
    text: spans
      .map((span) => `[${span.id}] Doc ${span.docId} p.${span.page}: ${span.quote}`)
      .join("\n\n"),
  };
}

export function splitSource(source: SourceMap, budget = defaultBudget) {
  const segments: Segment[] = [];
  let batch: SourceSpan[] = [];
  let batchMetrics = metrics();

  for (const span of source.sourceSpans) {
    const nextMetrics = {
      ...batchMetrics,
      pages: new Set(batchMetrics.pages),
    };
    add(nextMetrics, span);

    if (batch.length > 0 && over(nextMetrics, budget)) {
      segments.push(makeSegment(segments.length, batch));
      batch = [];
      batchMetrics = metrics();
    }

    batch.push(span);
    add(batchMetrics, span);
  }

  if (batch.length > 0) {
    segments.push(makeSegment(segments.length, batch));
  }

  return segments;
}
