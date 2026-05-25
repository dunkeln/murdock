import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import {
  type GenerateObjectResult,
  type ModelError,
  modelErrorSchema,
} from "@/lib/ai";
import type { Finding, HarnessDoc, HarnessError } from "@/lib/contracts/harness";
import { harnessErrorSchema } from "@/lib/contracts/harness";
import { generateObject } from "@/lib/server/ai/generate-object";
import { compileDraft } from "@/lib/server/harness/workflows/v1/draft";
import type { Segment } from "@/lib/server/harness/workflows/v1/segment";

const promptPath = join(process.cwd(), "prompts", "harness-v1.md");
const MAX_SEGMENT_CALLS = 2;
const rawDraftSchema = z.record(z.string(), z.unknown());

const candidateSchema = z.object({
  drafts: z.array(rawDraftSchema).min(1),
  extras: z.record(z.string(), z.unknown()).default({}),
}).passthrough();

export type Candidate = z.input<typeof candidateSchema>;

const envelopeSchema = z.object({
  draftsJson: z.string().min(2),
}).passthrough();

export type ExtractResult =
  | {
      findings: Finding[];
      model: string;
      ok: true;
      provider: string;
      usage: { inputTokens: number | null; outputTokens: number | null };
    }
  | { error: HarnessError; ok: false };

function modelError(error: ModelError): HarnessError {
  return harnessErrorSchema.parse({
    isError: true,
    errorCategory:
      error.errorCategory === "configuration"
        ? "configuration"
        : error.errorCategory === "schema_validation"
          ? "schema_validation"
          : "provider",
    isRetryable: error.isRetryable,
    message: error.message,
    provider: error.provider,
  });
}

export function mapCandidate(input: {
  candidate: Candidate;
  doc: HarnessDoc;
  segment: Segment;
}): Finding[] {
  return input.candidate.drafts.map((raw, index) =>
    compileDraft({
      doc: input.doc,
      index: input.segment.index * 1000 + index,
      raw,
      segment: input.segment,
    }),
  );
}

function inputForModel(input: {
  docs: HarnessDoc[];
  repair?: boolean;
  segment: Segment;
}) {
  return JSON.stringify(
    {
      docs: input.docs,
      segment: {
        index: input.segment.index,
        sourceSpans: input.segment.spans.map((span) => ({
          id: span.id,
          docId: span.docId,
          page: span.page,
          quote: span.quote,
          ocrConfidence: span.ocrConfidence,
        })),
      },
      output:
        input.repair
          ? "Repair only: draftsJson must be a JSON string with a non-empty drafts array."
          : "Return draftsJson only. It must be a JSON string with source-grounded drafts that use sourceSpanIds from this segment.",
    },
    null,
    2,
  );
}

function candidateInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { drafts: value };
  }
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;

    for (const key of ["drafts", "findings", "items", "records"]) {
      if (Array.isArray(raw[key])) {
        return { ...raw, drafts: raw[key] };
      }
    }
  }

  return value;
}

async function prompt() {
  return readFile(promptPath, "utf8");
}

export async function extractFindings(input: {
  docs: HarnessDoc[];
  segments: Segment[];
}): Promise<ExtractResult> {
  const findings: Finding[] = [];
  let model = "unknown";
  let provider = "anthropic";
  let inputTokens = 0;
  let outputTokens = 0;
  const results = await callSegments({
    docs: input.docs,
    segments: input.segments,
  });

  for (const item of results) {
    const finalResult = item.result;

    if (!finalResult.ok) {
      return { ok: false, error: modelError(finalResult.error) };
    }

    findings.push(
      ...mapCandidate({
        candidate: finalResult.data,
        doc: input.docs[0]!,
        segment: item.segment,
      }),
    );
    model = finalResult.model;
    provider = finalResult.provider;
    inputTokens += finalResult.usage.inputTokens ?? 0;
    outputTokens += finalResult.usage.outputTokens ?? 0;
  }

  return {
    ok: true,
    findings,
    model,
    provider,
    usage: { inputTokens, outputTokens },
  };
}

async function callSegments(input: {
  docs: HarnessDoc[];
  segments: Segment[];
}): Promise<Array<{ result: GenerateObjectResult<Candidate>; segment: Segment }>> {
  const results: Array<
    { result: GenerateObjectResult<Candidate>; segment: Segment } | undefined
  > = [];
  let nextIndex = 0;
  const workerCount = Math.min(MAX_SEGMENT_CALLS, input.segments.length);
  const workers = Array.from({ length: workerCount }, async () => {
    let currentIndex = nextIndex;
    nextIndex += 1;

    while (currentIndex < input.segments.length) {
      const segment = input.segments[currentIndex]!;

      results[currentIndex] = {
        result: await callSegment({ docs: input.docs, segment }),
        segment,
      };
      currentIndex = nextIndex;
      nextIndex += 1;
    }
  });

  await Promise.all(workers);

  return results.filter((result): result is NonNullable<typeof result> =>
    Boolean(result),
  );
}

async function callSegment(input: {
  docs: HarnessDoc[];
  segment: Segment;
}): Promise<GenerateObjectResult<Candidate>> {
  const result = await callModel({ docs: input.docs, segment: input.segment });

  return !result.ok && result.error.errorCategory === "schema_validation"
    ? callModel({ docs: input.docs, repair: true, segment: input.segment })
    : result;
}

async function callModel(input: {
  docs: HarnessDoc[];
  repair?: boolean;
  segment: Segment;
}): Promise<GenerateObjectResult<Candidate>> {
  const result = await generateObject({
    allowFallback: false,
    maxOutputTokens: 4096,
    messages: [{ role: "user", content: inputForModel(input) }],
    preferredProvider: "anthropic",
    schema: envelopeSchema,
    schemaDescription:
      "Object with draftsJson, a JSON string matching the draft schema.",
    schemaName: "murdock_harness_v1",
    system: await prompt(),
    temperature: 0,
    use: "harness-extract",
  });

  if (!result.ok) {
    return result;
  }

  try {
    const parsedJson = JSON.parse(result.data.draftsJson);
    const parsed = candidateSchema.safeParse(candidateInput(parsedJson));

    if (!parsed.success) {
      return {
        ok: false,
        error: schemaError(z.prettifyError(parsed.error), result.provider),
      };
    }

    return { ...result, data: parsed.data };
  } catch (error) {
    return {
      ok: false,
      error: schemaError(
        error instanceof Error ? error.message : "Invalid draftsJson.",
        result.provider,
      ),
    };
  }
}

function schemaError(message: string, provider: string): ModelError {
  return modelErrorSchema.parse({
    isError: true,
    errorCategory: "schema_validation",
    isRetryable: false,
    message: `Model output failed schema validation. ${message}`,
    provider,
  });
}
