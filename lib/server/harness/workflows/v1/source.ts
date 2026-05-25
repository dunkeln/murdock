import "server-only";

import {
  type HarnessDoc,
  type SourceSpan,
  docSchema,
  sourceSpanSchema,
} from "@/lib/contracts/harness";
import type { MistralOcrResult } from "@/lib/contracts/document-ingestion";
import type { OcrConversionDto } from "@/lib/contracts/ocr-conversions";
import { id } from "@/lib/server/harness/workflows/v1/ids";

export type SourceMap = {
  docs: HarnessDoc[];
  fullText: string;
  pages: Array<{ docId: string; page: number; markdown: string }>;
  sourceSpans: SourceSpan[];
};

export type SourceInput = {
  caseId?: string | null;
  docId?: string | null;
  documentSha256?: string | null;
  fileName: string;
  ocrConversionId?: string | null;
  ocrResult: MistralOcrResult;
  provider?: "mistral";
  providerModel: string;
};

export type ConversionInput = {
  caseId?: string | null;
  conversion: OcrConversionDto;
  docId?: string | null;
  fileName: string;
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function blocks(markdown: string) {
  const out: Array<{ text: string; start: number; end: number }> = [];
  let cursor = 0;

  for (const raw of markdown.split(/\n{2,}/)) {
    const start = markdown.indexOf(raw, cursor);
    const safeStart = start >= 0 ? start : cursor;
    const text = raw.trim();

    if (text) {
      out.push({ text, start: safeStart, end: safeStart + raw.length });
    }
    cursor = safeStart + raw.length;
  }

  return out;
}

function toDoc(input: SourceInput): HarnessDoc {
  const docId =
    input.docId ??
    id([
      input.caseId,
      input.ocrConversionId,
      input.documentSha256,
      input.fileName,
      input.providerModel,
    ]);

  return docSchema.parse({
    id: docId,
    caseId: input.caseId ?? null,
    fileName: input.fileName,
    ocrConversionId: input.ocrConversionId ?? null,
    pageCount: input.ocrResult.pages.length,
    provider: input.provider ?? "mistral",
    providerModel: input.providerModel,
    sha256: input.documentSha256 ?? null,
  });
}

export function buildSourceMap(input: SourceInput): SourceMap {
  const doc = toDoc(input);
  const pages = input.ocrResult.pages.map((page) => ({
    docId: doc.id,
    markdown: page.markdown,
    page: page.index + 1,
  }));
  const sourceSpans = pages.flatMap((page) => {
    return blocks(page.markdown).map((block, index) =>
      sourceSpanSchema.parse({
        id: id([doc.id, page.page, index, block.start, block.end]),
        docId: doc.id,
        page: page.page,
        charStart: block.start,
        charEnd: block.end,
        quote: clean(block.text),
        bbox: null,
        ocrConfidence: null,
      }),
    );
  });

  return {
    docs: [doc],
    fullText: input.ocrResult.markdown,
    pages,
    sourceSpans,
  };
}

export function buildSourceMapFromConversion(input: ConversionInput) {
  if (input.conversion.status !== "ready" || !input.conversion.markdown) {
    throw new Error("OCR conversion must be ready and include markdown.");
  }

  return buildSourceMap({
    caseId: input.caseId,
    docId: input.docId,
    documentSha256: input.conversion.documentSha256,
    fileName: input.fileName,
    ocrConversionId: input.conversion.id,
    ocrResult: {
      markdown: input.conversion.markdown,
      model: input.conversion.providerModel,
      pages: [
        {
          dimensions: null,
          images: [],
          index: 0,
          markdown: input.conversion.markdown,
        },
      ],
      usage: {
        docSizeBytes: null,
        pagesProcessed: input.conversion.pagesProcessed ?? 1,
      },
    },
    provider: input.conversion.provider,
    providerModel: input.conversion.providerModel,
  });
}
