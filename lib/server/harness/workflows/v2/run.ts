import "server-only";

import {
  type HarnessBundle,
  type HarnessError,
  bundleSchema,
  harnessErrorSchema,
} from "@/lib/contracts/harness";
import { HARNESS_V2_VERSION } from "@/lib/contracts/harness-v2";
import type { OcrConversionDto } from "@/lib/contracts/ocr-conversions";
import { computeGates } from "@/lib/server/harness/workflows/v1/gates";
import { qualityFindings } from "@/lib/server/harness/workflows/v1/quality";
import { findConflicts } from "@/lib/server/harness/workflows/v1/reconcile";
import {
  type HarnessRunObserver,
  type RunResult,
} from "@/lib/server/harness/workflows/v1/run";
import {
  buildSourceMapFromConversion,
  type SourceMap,
} from "@/lib/server/harness/workflows/v1/source";
import { compileHarnessV2Annotation } from "@/lib/server/harness/workflows/v2/compile";
import { compileHarnessV2LegalReview } from "@/lib/server/harness/workflows/v2/legal-review";

export type RunAnnotatedConversionInput = {
  annotation: unknown;
  caseId?: string | null;
  conversion: OcrConversionDto;
  docId?: string | null;
  fileName: string;
  observer?: HarnessRunObserver;
  provider?: "mistral";
  providerModel?: string;
};

function toHarnessError(error: unknown): HarnessError {
  return harnessErrorSchema.parse({
    isError: true,
    errorCategory: error instanceof Error ? "schema_validation" : "unknown",
    isRetryable: false,
    message:
      error instanceof Error
        ? `Harness V2 annotation failed validation. ${error.message}`
        : "Harness V2 annotation failed validation.",
    provider: "mistral",
  });
}

function toBundle(input: {
  annotation: unknown;
  source: SourceMap;
}): HarnessBundle {
  const findings = [
    ...qualityFindings(input.source),
    ...compileHarnessV2Annotation(input),
    ...compileHarnessV2LegalReview(input),
  ];
  const conflicts = findConflicts(findings);
  const gates = computeGates({ conflicts, findings });

  return bundleSchema.parse({
    version: "harness.v1",
    docs: input.source.docs,
    sourceSpans: input.source.sourceSpans,
    findings,
    conflicts,
    gates,
    resolutions: [],
    stats: {
      conflictCount: conflicts.length,
      docCount: input.source.docs.length,
      findingCount: findings.length,
      gateCount: gates.length,
      spanCount: input.source.sourceSpans.length,
    },
  });
}

export async function runHarnessV2FromAnnotatedConversion(
  input: RunAnnotatedConversionInput,
): Promise<RunResult> {
  try {
    await input.observer?.onStepStarted?.({ ordinal: 0, stepName: "source-map" });
    const source = buildSourceMapFromConversion(input);
    await input.observer?.onArtifact?.({
      artifact: {
        docs: source.docs,
        pageCount: source.pages.length,
        sourceSpans: source.sourceSpans,
        spanCount: source.sourceSpans.length,
      },
      kind: "source_map",
      ordinal: 0,
      status: "succeeded",
      stepName: "source-map",
      summary: {
        docCount: source.docs.length,
        spanCount: source.sourceSpans.length,
      },
    });
    await input.observer?.onStepFinished?.({
      error: null,
      metrics: {
        docCount: source.docs.length,
        spanCount: source.sourceSpans.length,
      },
      ordinal: 0,
      status: "succeeded",
      stepName: "source-map",
    });

    await input.observer?.onStepStarted?.({ ordinal: 1, stepName: "annotate" });
    await input.observer?.onArtifact?.({
      artifact: input.annotation,
      kind: "v2_document_annotation",
      ordinal: 1,
      status: "succeeded",
      stepName: "annotate",
      summary: {
        harnessVersion: HARNESS_V2_VERSION,
      },
    });
    await input.observer?.onStepFinished?.({
      error: null,
      metrics: {
        harnessVersion: HARNESS_V2_VERSION,
      },
      ordinal: 1,
      status: "succeeded",
      stepName: "annotate",
    });

    await input.observer?.onStepStarted?.({ ordinal: 2, stepName: "compile" });
    const bundle = toBundle({ annotation: input.annotation, source });
    await input.observer?.onArtifact?.({
      artifact: bundle,
      kind: "bundle",
      ordinal: 2,
      status: "succeeded",
      stepName: "compile",
      summary: bundle.stats,
    });
    await input.observer?.onStepFinished?.({
      error: null,
      metrics: bundle.stats,
      ordinal: 2,
      status: "succeeded",
      stepName: "compile",
    });

    return {
      ok: true,
      bundle,
      model: input.providerModel ?? input.conversion.providerModel,
      provider: input.provider ?? input.conversion.provider,
      usage: { inputTokens: null, outputTokens: null },
    };
  } catch (error) {
    const harnessError = toHarnessError(error);

    return { ok: false, error: harnessError };
  }
}
