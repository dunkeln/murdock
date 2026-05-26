import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { neon } from "@neondatabase/serverless";
import nextEnv from "@next/env";
import { describe, expect, it } from "vitest";

import type { Finding, HarnessBundle } from "@/lib/contracts/harness";
import type { OcrConversionDto } from "@/lib/contracts/ocr-conversions";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const caseId = "8dac7c08-d806-40aa-a7cf-e954f7e2af8e";
const conversionId = "c437b9d4-4905-4a59-b694-33389fb14685";
const docId = `ocr-${conversionId}`;
const fileName = "ud-100-complaint-unlawful-detainer copy.pdf";
const pdfPath = join(
  process.cwd(),
  "examples",
  "real-estate-eviction-unlawful-detainer",
  "pdfs",
  fileName,
);

type ConversionRow = {
  id: string;
  firm_id: string;
  document_sha256: string;
  provider: "mistral";
  provider_model: string;
  status: OcrConversionDto["status"];
  markdown: string | null;
  pages_processed: number | null;
  error_message: string | null;
  expires_at: Date | string;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function connectionString() {
  const raw = process.env.NEON_CONN_URL;

  if (!raw) {
    throw new Error("NEON_CONN_URL is not configured.");
  }

  return raw.replace(/\s*&\s*$/, "") + (raw.includes("channel_binding=") ? "" : "&channel_binding=require");
}

function toIso(value: Date | string | null) {
  return value === null ? null : new Date(value).toISOString();
}

async function loadConversion(): Promise<OcrConversionDto> {
  const sql = neon(connectionString());
  const rows = (await sql`
    select
      id,
      firm_id,
      document_sha256,
      provider,
      provider_model,
      status,
      markdown,
      pages_processed,
      error_message,
      expires_at,
      deleted_at,
      created_at,
      updated_at
    from public.ocr_conversions
    where id = ${conversionId}
    limit 1
  `) as ConversionRow[];
  const row = rows[0];

  if (!row || !row.markdown) {
    throw new Error(`Ready OCR conversion not found: ${conversionId}`);
  }

  return {
    id: row.id,
    firmId: row.firm_id,
    documentSha256: row.document_sha256,
    provider: row.provider,
    providerModel: row.provider_model,
    status: row.status,
    markdown: row.markdown,
    documentAnnotation: null,
    pagesProcessed: row.pages_processed,
    errorMessage: row.error_message,
    expiresAt: toIso(row.expires_at)!,
    deletedAt: toIso(row.deleted_at),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
  };
}

function ms(start: number) {
  return Math.round(performance.now() - start);
}

function bySeverity(findings: Finding[]) {
  return findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.materiality] = (counts[finding.materiality] ?? 0) + 1;

    return counts;
  }, {});
}

function bundleSummary(bundle: HarnessBundle) {
  const sourcedFindings = bundle.findings.filter(
    (finding) => finding.sourceSpans.length > 0,
  );
  const issueFindings = bundle.findings.filter(
    (finding) => !["fact", "timeline_event", "obligation"].includes(finding.kind),
  );

  return {
    stats: bundle.stats,
    sourcedFindingCount: sourcedFindings.length,
    sourcedFindingRate:
      bundle.findings.length === 0
        ? 0
        : Number((sourcedFindings.length / bundle.findings.length).toFixed(3)),
    issueFindingCount: issueFindings.length,
    blockingGateCount: bundle.gates.filter((gate) => gate.blocking).length,
    materialityCounts: bySeverity(bundle.findings),
    titles: bundle.findings.map((finding) => finding.title),
    issueTitles: issueFindings.map((finding) => finding.title),
  };
}

function overlap(left: string[], right: string[]) {
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
  const leftSet = new Set(left.map(normalize));
  const rightSet = new Set(right.map(normalize));
  const shared = [...leftSet].filter((item) => rightSet.has(item));
  const union = new Set([...leftSet, ...rightSet]);

  return {
    shared,
    sharedCount: shared.length,
    jaccard: union.size === 0 ? 0 : Number((shared.length / union.size).toFixed(3)),
  };
}

const describeBenchmark =
  process.env.RUN_HARNESS_AB_BENCHMARK === "1" ? describe : describe.skip;

describeBenchmark("harness extraction A/B benchmark", () => {
  it(
    "compares V1 Claude extraction against Mistral OCR document annotation",
    async () => {
      const conversion = await loadConversion();
      const { runHarnessFromConversion } = await import(
        "@/lib/server/harness/workflows/v1/run"
      );
      const { uploadAndAnnotateDocumentForHarnessV2 } = await import(
        "@/lib/server/adapters/mistral"
      );
      const { runHarnessV2FromAnnotatedConversion } = await import(
        "@/lib/server/harness/workflows/v2/run"
      );

      const v1Started = performance.now();
      const v1 = await runHarnessFromConversion({
        caseId,
        conversion,
        docId,
        fileName,
      });
      const v1Ms = ms(v1Started);

      if (!v1.ok) {
        console.info(JSON.stringify({ phase: "v1", elapsedMs: v1Ms, error: v1.error }, null, 2));
        throw new Error(v1.error.message);
      }

      const pdf = await readFile(pdfPath);
      const v2OcrStarted = performance.now();
      const annotatedOcr = await uploadAndAnnotateDocumentForHarnessV2({
        fileName,
        content: pdf,
      });
      const v2OcrMs = ms(v2OcrStarted);

      if (annotatedOcr.isError) {
        console.info(
          JSON.stringify(
            { phase: "v2-mistral-annotation", elapsedMs: v2OcrMs, error: annotatedOcr },
            null,
            2,
          ),
        );
        throw new Error(annotatedOcr.message);
      }
      expect(annotatedOcr.data.documentAnnotation).not.toBeNull();

      const v2Conversion: OcrConversionDto = {
        ...conversion,
        markdown: annotatedOcr.data.markdown,
        documentAnnotation: annotatedOcr.data.documentAnnotation,
        pagesProcessed: annotatedOcr.data.usage.pagesProcessed,
      };
      const v2CompileStarted = performance.now();
      const v2 = await runHarnessV2FromAnnotatedConversion({
        annotation: annotatedOcr.data.documentAnnotation,
        caseId,
        conversion: v2Conversion,
        docId,
        fileName,
      });
      const v2CompileMs = ms(v2CompileStarted);

      expect(v2.ok).toBe(true);
      if (!v2.ok) {
        throw new Error(v2.error.message);
      }

      const report = {
        benchmarkedAt: new Date().toISOString(),
        caseId,
        fileName,
        conversionId,
        timingsMs: {
          v1ExistingOcrPlusClaudeExtract: v1Ms,
          v2MistralOcrPlusAnnotation: v2OcrMs,
          v2AnnotationCompile: v2CompileMs,
          v2Total: v2OcrMs + v2CompileMs,
        },
        usage: {
          v1: v1.usage,
          v2: {
            pagesProcessed: annotatedOcr.data.usage.pagesProcessed,
            docSizeBytes: annotatedOcr.data.usage.docSizeBytes,
            llmTokens: null,
          },
        },
        summaries: {
          v1: bundleSummary(v1.bundle),
          v2: bundleSummary(v2.bundle),
        },
        overlap: {
          allTitles: overlap(
            v1.bundle.findings.map((finding) => finding.title),
            v2.bundle.findings.map((finding) => finding.title),
          ),
          issueTitles: overlap(
            bundleSummary(v1.bundle).issueTitles,
            bundleSummary(v2.bundle).issueTitles,
          ),
        },
        sampleFindings: {
          v1: v1.bundle.findings.slice(0, 12).map((finding) => ({
            kind: finding.kind,
            status: finding.status,
            materiality: finding.materiality,
            title: finding.title,
            sourceSpanCount: finding.sourceSpans.length,
          })),
          v2: v2.bundle.findings.slice(0, 12).map((finding) => ({
            kind: finding.kind,
            status: finding.status,
            materiality: finding.materiality,
            title: finding.title,
            sourceSpanCount: finding.sourceSpans.length,
          })),
        },
      };

      await writeFile(
        join(process.cwd(), ".codex", "harness-ab-benchmark-report.json"),
        `${JSON.stringify(report, null, 2)}\n`,
      );
      console.info(JSON.stringify(report, null, 2));
    },
    240_000,
  );
});
