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

export type HarnessRunStepStatus = "started" | "succeeded" | "failed";

export type HarnessRunArtifactKind =
  | "source_map"
  | "quality_findings"
  | "segments"
  | "v2_document_annotation"
  | "v2_review_reducer"
  | "v3_review_reducer"
  | "extracted_findings"
  | "bundle"
  | "error";

export type HarnessRunObserver = {
  onArtifact?: (input: {
    artifact: unknown;
    kind: HarnessRunArtifactKind;
    ordinal: number;
    status: Exclude<HarnessRunStepStatus, "started">;
    stepName: string;
    summary: Record<string, unknown>;
  }) => Promise<void> | void;
  onStepFinished?: (input: {
    error: HarnessError | null;
    metrics: Record<string, unknown>;
    ordinal: number;
    status: Exclude<HarnessRunStepStatus, "started">;
    stepName: string;
  }) => Promise<void> | void;
  onStepStarted?: (input: {
    ordinal: number;
    stepName: string;
  }) => Promise<void> | void;
};

export type RunInput = {
  budget?: Budget;
  caseId?: string | null;
  docId?: string | null;
  documentSha256?: string | null;
  fileName: string;
  ocrConversionId?: string | null;
  ocrResult: MistralOcrResult;
  observer?: HarnessRunObserver;
  provider?: "mistral";
  providerModel: string;
};

export type RunConversionInput = {
  budget?: Budget;
  caseId?: string | null;
  conversion: OcrConversionDto;
  docId?: string | null;
  fileName: string;
  observer?: HarnessRunObserver;
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

function compactSource(source: SourceMap | null) {
  if (!source) {
    return null;
  }

  return {
    docs: source.docs,
    pageCount: source.pages.length,
    sourceSpans: source.sourceSpans,
    spanCount: source.sourceSpans.length,
  };
}

function compactSegments(segments: Segment[]) {
  return segments.map((segment) => ({
    index: segment.index,
    spanIds: segment.spans.map((span) => span.id),
    spans: segment.spans,
    text: segment.text,
  }));
}

function stepArtifactKind(stepName: string): HarnessRunArtifactKind {
  if (stepName === "source-map") {
    return "source_map";
  }
  if (stepName === "quality") {
    return "quality_findings";
  }
  if (stepName === "segment") {
    return "segments";
  }

  return "extracted_findings";
}

function summarizeCtx(ctx: Ctx): Record<string, unknown> {
  return {
    docCount: ctx.source?.docs.length ?? 0,
    findingCount: ctx.findings.length,
    inputTokens: ctx.usage.inputTokens,
    outputTokens: ctx.usage.outputTokens,
    segmentCount: ctx.segments.length,
    spanCount: ctx.source?.sourceSpans.length ?? 0,
  };
}

function stepArtifact(stepName: string, ctx: Ctx) {
  if (stepName === "source-map") {
    return compactSource(ctx.source);
  }
  if (stepName === "quality") {
    return {
      findings: ctx.findings,
    };
  }
  if (stepName === "segment") {
    return {
      budget: ctx.budget ?? null,
      segments: compactSegments(ctx.segments),
    };
  }

  return {
    findings: ctx.findings,
    usage: ctx.usage,
  };
}

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

  let activeStep: { name: string; ordinal: number } | null = null;

  try {
    for (const [index, step] of [sourceStep(input), ...steps].entries()) {
      activeStep = { name: step.name, ordinal: index };
      await input.observer?.onStepStarted?.({
        ordinal: index,
        stepName: step.name,
      });

      const next = await step.run(ctx);

      if (isError(next)) {
        await input.observer?.onStepFinished?.({
          error: next,
          metrics: summarizeCtx(ctx),
          ordinal: index,
          status: "failed",
          stepName: step.name,
        });
        await input.observer?.onArtifact?.({
          artifact: next,
          kind: "error",
          ordinal: index,
          status: "failed",
          stepName: step.name,
          summary: {
            errorCategory: next.errorCategory,
            isRetryable: next.isRetryable,
          },
        });
        return { ok: false, error: next };
      }
      ctx = next;
      await input.observer?.onArtifact?.({
        artifact: stepArtifact(step.name, ctx),
        kind: stepArtifactKind(step.name),
        ordinal: index,
        status: "succeeded",
        stepName: step.name,
        summary: summarizeCtx(ctx),
      });
      await input.observer?.onStepFinished?.({
        error: null,
        metrics: summarizeCtx(ctx),
        ordinal: index,
        status: "succeeded",
        stepName: step.name,
      });
    }

    const bundle = toBundle(ctx);
    await input.observer?.onArtifact?.({
      artifact: bundle,
      kind: "bundle",
      ordinal: steps.length + 1,
      status: "succeeded",
      stepName: "bundle",
      summary: bundle.stats,
    });

    return {
      ok: true,
      bundle,
      model: ctx.model,
      provider: ctx.provider,
      usage: ctx.usage,
    };
  } catch (error) {
    const harnessError = harnessErrorSchema.parse({
      isError: true,
      errorCategory:
        error instanceof Error && error.message.includes("ready")
          ? "ocr_not_ready"
          : "unknown",
      isRetryable: true,
      message: error instanceof Error ? error.message : "Harness failed.",
      provider: null,
    });

    if (activeStep) {
      await input.observer?.onStepFinished?.({
        error: harnessError,
        metrics: summarizeCtx(ctx),
        ordinal: activeStep.ordinal,
        status: "failed",
        stepName: activeStep.name,
      });
      await input.observer?.onArtifact?.({
        artifact: harnessError,
        kind: "error",
        ordinal: activeStep.ordinal,
        status: "failed",
        stepName: activeStep.name,
        summary: {
          errorCategory: harnessError.errorCategory,
          isRetryable: harnessError.isRetryable,
        },
      });
    }

    return { ok: false, error: harnessError };
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
      documentAnnotation: null,
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
    observer: input.observer,
    provider: doc.provider,
    providerModel: doc.providerModel,
  });
}
