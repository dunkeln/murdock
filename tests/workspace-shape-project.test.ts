import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HarnessBundle } from "@/lib/contracts/harness";
import type { OcrConversionDto } from "@/lib/contracts/ocr-conversions";
import {
  shapeFromOcr,
  type SourceInput,
} from "@/lib/server/workflows/shape/project";
import {
  maxAutoHarnessFailedRuns,
  partitionSourcesByHarnessState,
} from "@/lib/server/workflows/shape/source-selection";

const runHarnessFromConversionMock = vi.hoisted(() => vi.fn());
const originalMaxSourceCalls = process.env.HARNESS_MAX_SOURCE_CALLS;
const originalAutoMaxRetries = process.env.HARNESS_AUTO_MAX_RETRIES;

vi.mock("@/lib/server/harness/workflows/v1/run", () => ({
  runHarnessFromConversion: runHarnessFromConversionMock,
}));

const caseId = "11111111-1111-4111-8111-111111111111";
const conversionIds = [
  "22222222-2222-4222-8222-222222222221",
  "22222222-2222-4222-8222-222222222222",
  "22222222-2222-4222-8222-222222222223",
];
const now = "2026-01-01T00:00:00.000Z";

function conversion(id: string): OcrConversionDto {
  return {
    id,
    firmId: "firm-1",
    documentSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    provider: "mistral",
    providerModel: "mistral-ocr-latest",
    status: "ready",
    markdown: `Document ${id}`,
    pagesProcessed: 1,
    errorMessage: null,
    expiresAt: now,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function source(id: string, index: number): SourceInput {
  return {
    conversion: conversion(id),
    fileName: `source-${index}.pdf`,
    sourceKey: `ocr-${id}`,
  };
}

function bundle(): HarnessBundle {
  return {
    version: "harness.v1",
    docs: [],
    sourceSpans: [],
    findings: [],
    conflicts: [],
    gates: [],
    resolutions: [],
    stats: {
      conflictCount: 0,
      docCount: 1,
      findingCount: 0,
      gateCount: 0,
      spanCount: 0,
    },
  };
}

describe("workspace shape projection", () => {
  beforeEach(() => {
    process.env.HARNESS_MAX_SOURCE_CALLS = "2";
    runHarnessFromConversionMock.mockReset();
  });

  afterEach(() => {
    if (originalMaxSourceCalls === undefined) {
      delete process.env.HARNESS_MAX_SOURCE_CALLS;
    } else {
      process.env.HARNESS_MAX_SOURCE_CALLS = originalMaxSourceCalls;
    }
    if (originalAutoMaxRetries === undefined) {
      delete process.env.HARNESS_AUTO_MAX_RETRIES;
    } else {
      process.env.HARNESS_AUTO_MAX_RETRIES = originalAutoMaxRetries;
    }
  });

  it("runs source harnesses with bounded concurrency and stable output order", async () => {
    const releases = new Map<string, () => void>();
    const calls: string[] = [];
    let inFlight = 0;
    let peakInFlight = 0;

    runHarnessFromConversionMock.mockImplementation(
      async (input: { conversion: OcrConversionDto }) => {
        calls.push(input.conversion.id);
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);

        await new Promise<void>((resolve) => {
          releases.set(input.conversion.id, resolve);
        });

        inFlight -= 1;

        return {
          ok: true,
          bundle: bundle(),
          model: "claude-test",
          provider: "anthropic",
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    );

    const resultPromise = shapeFromOcr({
      caseId,
      sources: conversionIds.map(source),
    });

    await vi.waitFor(() => {
      expect(calls).toEqual(conversionIds.slice(0, 2));
    });
    expect(peakInFlight).toBe(2);

    releases.get(conversionIds[0]!)?.();
    await vi.waitFor(() => {
      expect(calls).toEqual(conversionIds);
    });

    releases.get(conversionIds[1]!)?.();
    releases.get(conversionIds[2]!)?.();

    const result = await resultPromise;

    if ("isError" in result) {
      throw new Error(result.message);
    }

    expect(result.bundles.map((item) => item.source.sourceKey)).toEqual(
      conversionIds.map((id) => `ocr-${id}`),
    );
  });

  it("selects only OCR sources without completed or running harness work", () => {
    const sources = conversionIds.map(source);

    const result = partitionSourcesByHarnessState(sources, {
      completedSourceKeys: [`ocr-${conversionIds[0]}`],
      runningSourceKeys: [`ocr-${conversionIds[1]}`],
    });

    expect(result.completedSources.map((item) => item.sourceKey)).toEqual([
      `ocr-${conversionIds[0]}`,
    ]);
    expect(result.runningSources.map((item) => item.sourceKey)).toEqual([
      `ocr-${conversionIds[1]}`,
    ]);
    expect(result.sourcesToShape.map((item) => item.sourceKey)).toEqual([
      `ocr-${conversionIds[2]}`,
    ]);
  });

  it("stops eager retries once a source reaches the configured failure cap", () => {
    const sources = conversionIds.map(source);

    const result = partitionSourcesByHarnessState(
      sources,
      {
        completedSourceKeys: [],
        failedRunCountsBySourceKey: {
          [`ocr-${conversionIds[0]}`]: 3,
          [`ocr-${conversionIds[1]}`]: 1,
        },
        runningSourceKeys: [],
      },
      { maxFailedRuns: 3 },
    );

    expect(result.exhaustedSources.map((item) => item.sourceKey)).toEqual([
      `ocr-${conversionIds[0]}`,
    ]);
    expect(result.sourcesToShape.map((item) => item.sourceKey)).toEqual([
      `ocr-${conversionIds[1]}`,
      `ocr-${conversionIds[2]}`,
    ]);
  });

  it("treats auto max retries as retries after the first failed attempt", () => {
    process.env.HARNESS_AUTO_MAX_RETRIES = "2";

    expect(maxAutoHarnessFailedRuns()).toBe(3);
  });
});
