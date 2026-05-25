import { loadEnvConfig } from "@next/env";

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

loadEnvConfig(process.cwd());

const runE2e = process.env.RUN_HARNESS_E2E === "1";
const maybeDescribe = runE2e ? describe : describe.skip;
const outDir = join(process.cwd(), ".tmp", "harness-v1-e2e");
const fixtures = [
  "examples/family-law-divorce-intake/pdfs/fl-110-summons-family-law.pdf",
  "examples/personal-injury-civil-complaint/pdfs/sum-100-summons.pdf",
];

maybeDescribe("harness v1 e2e", () => {
  it(
    "holds on two example PDFs through OCR and Anthropic extraction",
    async () => {
      const { uploadAndOcrDocument } = await import(
        "@/lib/server/adapters/mistral"
      );
      const { runHarness } = await import(
        "@/lib/server/harness/workflows/v1/run"
      );

      await mkdir(outDir, { recursive: true });

      for (const [index, filePath] of fixtures.entries()) {
        const content = await readFile(join(process.cwd(), filePath));
        const ocr = await uploadAndOcrDocument({
          content,
          fileName: basename(filePath),
        });

        expect(ocr.isError).toBe(false);
        if (ocr.isError) {
          throw new Error(ocr.message);
        }

        const result = await runHarness({
          caseId: "11111111-1111-4111-8111-111111111111",
          docId: `e2e-doc-${index + 1}`,
          fileName: basename(filePath),
          ocrResult: ocr.data,
          providerModel: ocr.data.model,
        });

        if (!result.ok) {
          await writeFile(
            join(outDir, `${index + 1}-${basename(filePath)}.error.json`),
            JSON.stringify(result.error, null, 2),
          );
          throw new Error(result.error.message);
        }

        const { bundle } = result;
        await writeFile(
          join(outDir, `${index + 1}-${basename(filePath)}.json`),
          JSON.stringify(
            {
              doc: basename(filePath),
              stats: bundle.stats,
              findings: bundle.findings.map((finding) => ({
                kind: finding.kind,
                type: finding.type,
                title: finding.title,
                status: finding.status,
                spans: finding.sourceSpans.length,
              })),
              conflicts: bundle.conflicts.length,
              gates: bundle.gates.map((gate) => gate.level),
            },
            null,
            2,
          ),
        );

        expect(bundle.sourceSpans.length).toBeGreaterThan(0);
        expect(bundle.findings.length).toBeGreaterThan(0);
        expect(bundle.gates.length).toBeGreaterThan(0);
        expect(
          bundle.findings.some(
            (finding) => finding.kind === "fact" && finding.sourceSpans.length > 0,
          ),
        ).toBe(true);
        for (const finding of bundle.findings) {
          if (
            finding.status === "confirmed" &&
            ["critical", "high"].includes(finding.materiality)
          ) {
            expect(finding.sourceSpans.length).toBeGreaterThan(0);
          }
        }
      }
    },
    240_000,
  );
});
