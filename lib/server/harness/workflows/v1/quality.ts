import "server-only";

import {
  type Finding,
  type SourceSpan,
  findingSchema,
} from "@/lib/contracts/harness";
import { id } from "@/lib/server/harness/workflows/v1/ids";
import type { SourceMap } from "@/lib/server/harness/workflows/v1/source";

function base(input: {
  idParts: Array<string | number>;
  sourceSpans: SourceSpan[];
  summary: string;
  title: string;
  type: string;
}): Finding {
  return findingSchema.parse({
    id: id(input.idParts),
    kind: "document_quality",
    type: input.type,
    title: input.title,
    summary: input.summary,
    normalizedValue: null,
    originalText: input.sourceSpans[0]?.quote ?? null,
    sourceSpans: input.sourceSpans,
    status: "unclear",
    materiality: "medium",
    evidenceQuality: input.sourceSpans.length > 0 ? "partial" : "none",
    confidenceBasis: {
      sourceQuality: input.sourceSpans.length > 0 ? "partial" : "none",
      ocrQuality: "mixed",
      ambiguity: "minor",
    },
    unresolvedQuestions: [],
  });
}

function tableCells(markdown: string) {
  return markdown
    .split("\n")
    .filter((line) => line.includes("|"))
    .reduce((count, line) => {
      return count + line.split("|").filter((cell) => cell.trim()).length;
    }, 0);
}

export function qualityFindings(source: SourceMap): Finding[] {
  const findings: Finding[] = [];
  const seenPages = new Map<string, number>();

  for (const page of source.pages) {
    const pageSpans = source.sourceSpans.filter(
      (span) => span.docId === page.docId && span.page === page.page,
    );
    const normalized = page.markdown.replace(/\s+/g, " ").trim();

    if (!normalized) {
      findings.push(
        base({
          idParts: [page.docId, page.page, "empty"],
          sourceSpans: [],
          summary: `Page ${page.page} has no OCR text.`,
          title: "Empty OCR page",
          type: "missing_page",
        }),
      );
      continue;
    }

    const duplicateOf = seenPages.get(normalized);
    if (duplicateOf) {
      findings.push(
        base({
          idParts: [page.docId, page.page, "duplicate", duplicateOf],
          sourceSpans: pageSpans.slice(0, 1),
          summary: `Page ${page.page} appears to duplicate page ${duplicateOf}.`,
          title: "Possible duplicate OCR page",
          type: "duplicate_page",
        }),
      );
    } else {
      seenPages.set(normalized, page.page);
    }

    if (tableCells(page.markdown) >= 150) {
      findings.push(
        base({
          idParts: [page.docId, page.page, "table-heavy"],
          sourceSpans: pageSpans.slice(0, 3),
          summary: `Page ${page.page} is table-heavy and may need numeric review.`,
          title: "Table-heavy OCR page",
          type: "ocr_uncertain",
        }),
      );
    }
  }

  return findings;
}
