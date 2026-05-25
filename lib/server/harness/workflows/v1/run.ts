import "server-only";

import {
  HARNESS_VERSION,
  type Finding,
  type HarnessBundle,
  type HarnessError,
  bundleSchema,
  harnessErrorSchema,
} from "@/lib/contracts/harness";
import type { MistralOcrResult } from "@/lib/contracts/document-ingestion";
import type { OcrConversionDto } from "@/lib/contracts/ocr-conversions";
import { extractFindings } from "@/lib/server/harness/workflows/v1/extract";
import { computeGates } from "@/lib/server/harness/workflows/v1/gates";
import { qualityFindings } from "@/lib/server/harness/workflows/v1/quality";
import { findConflicts } from "@/lib/server/harness/workflows/v1/reconcile";
import {
  type Budget,
  type Segment,
  splitSource,
} from "@/lib/server/harness/workflows/v1/segment";
import {
  type SourceMap,
  buildSourceMap,
  buildSourceMapFromConversion,
} from "@/lib/server/harness/workflows/v1/source";

export type Ctx = {
  budget?: Budget;
  findings: Finding[];
  model: string;
  provider: string;
  segments: Segment[];
  source: SourceMap | null;
  usage: { inputTokens: number; outputTokens: number };
};

export type Step = {
  name: string;
  run: (ctx: Ctx) => Promise<Ctx | HarnessError> | Ctx | HarnessError;
};

export type RunInput = {
  budget?: Budget;
  caseId?: string | null;
  docId?: string | null;
  documentSha256?: string | null;
  fileName: string;
  ocrConversionId?: string | null;
  ocrResult: MistralOcrResult;
  provider?: "mistral";
  providerModel: string;
};

export type RunConversionInput = {
  budget?: Budget;
  caseId?: string | null;
  conversion: OcrConversionDto;
  docId?: string | null;
  fileName: string;
};

export type RunResult =
  | {
      bundle: HarnessBundle;
      model: string;
      ok: true;
      provider: string;
      usage: { inputTokens: number | null; outputTokens: number | null };
    }
  | { error: HarnessError; ok: false };

function isError(value: Ctx | HarnessError): value is HarnessError {
  return "isError" in value;
}

function sourceStep(input: RunInput): Step {
  return {
    name: "source-map",
    run: (ctx) => ({
      ...ctx,
      source: buildSourceMap(input),
    }),
  };
}

export const qualityStep: Step = {
  name: "quality",
  run: (ctx) => ({
    ...ctx,
    findings: ctx.source
      ? [...ctx.findings, ...qualityFindings(ctx.source)]
      : ctx.findings,
  }),
};

export const segmentStep: Step = {
  name: "segment",
  run: (ctx) => ({
    ...ctx,
    segments: ctx.source ? splitSource(ctx.source, ctx.budget) : [],
  }),
};

export const extractStep: Step = {
  name: "extract",
  run: async (ctx) => {
    if (!ctx.source) {
      return ctx;
    }

    const result = await extractFindings({
      docs: ctx.source.docs,
      segments: ctx.segments,
    });

    return result.ok
      ? {
          ...ctx,
          findings: [...ctx.findings, ...result.findings],
          model: result.model,
          provider: result.provider,
          usage: {
            inputTokens: ctx.usage.inputTokens + (result.usage.inputTokens ?? 0),
            outputTokens:
              ctx.usage.outputTokens + (result.usage.outputTokens ?? 0),
          },
        }
      : result.error;
  },
};

export const v1Steps = [qualityStep, segmentStep, extractStep];

function toBundle(ctx: Ctx): HarnessBundle {
  if (!ctx.source) {
    throw new Error("Harness source map was not built.");
  }

  const conflicts = findConflicts(ctx.findings);
  const gates = computeGates({ conflicts, findings: ctx.findings });

  return bundleSchema.parse({
    version: HARNESS_VERSION,
    docs: ctx.source.docs,
    sourceSpans: ctx.source.sourceSpans,
    findings: ctx.findings,
    conflicts,
    gates,
    resolutions: [],
    stats: {
      conflictCount: conflicts.length,
      docCount: ctx.source.docs.length,
      findingCount: ctx.findings.length,
      gateCount: gates.length,
      spanCount: ctx.source.sourceSpans.length,
    },
  });
}

export async function runHarness(
  input: RunInput,
  steps: Step[] = v1Steps,
): Promise<RunResult> {
  let ctx: Ctx = {
    budget: input.budget,
    findings: [],
    model: "unknown",
    provider: "anthropic",
    segments: [],
    source: null,
    usage: { inputTokens: 0, outputTokens: 0 },
  };

  try {
    for (const step of [sourceStep(input), ...steps]) {
      const next = await step.run(ctx);

      if (isError(next)) {
        return { ok: false, error: next };
      }
      ctx = next;
    }

    return {
      ok: true,
      bundle: toBundle(ctx),
      model: ctx.model,
      provider: ctx.provider,
      usage: ctx.usage,
    };
  } catch (error) {
    return {
      ok: false,
      error: harnessErrorSchema.parse({
        isError: true,
        errorCategory:
          error instanceof Error && error.message.includes("ready")
            ? "ocr_not_ready"
            : "unknown",
        isRetryable: true,
        message: error instanceof Error ? error.message : "Harness failed.",
        provider: null,
      }),
    };
  }
}

export function sourceFromConversion(input: RunConversionInput) {
  return buildSourceMapFromConversion(input);
}

export async function runHarnessFromConversion(input: RunConversionInput) {
  const source = sourceFromConversion(input);
  const doc = source.docs[0]!;

  return runHarness({
    budget: input.budget,
    caseId: doc.caseId,
    docId: doc.id,
    documentSha256: doc.sha256,
    fileName: doc.fileName,
    ocrConversionId: doc.ocrConversionId,
    ocrResult: {
      markdown: source.fullText,
      model: doc.providerModel,
      pages: source.pages.map((page) => ({
        dimensions: null,
        images: [],
        index: page.page - 1,
        markdown: page.markdown,
      })),
      usage: { docSizeBytes: null, pagesProcessed: source.pages.length },
    },
    provider: doc.provider,
    providerModel: doc.providerModel,
  });
}
