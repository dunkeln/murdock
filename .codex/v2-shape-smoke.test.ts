import { readFile } from "node:fs/promises";

import nextEnv from "@next/env";
import { describe, expect, it } from "vitest";

const { loadEnvConfig } = nextEnv;

const runSmoke = process.env.RUN_HARNESS_V2_SHAPE_SMOKE === "1";

describe.skipIf(!runSmoke)("harness v2 shape smoke", () => {
  it("refreshes the sample PDF through V2 and persists richer review actions", async () => {
    loadEnvConfig(process.cwd());
    process.env.HARNESS_WORKFLOW_VERSION = "v2";

    const caseId = "8dac7c08-d806-40aa-a7cf-e954f7e2af8e";
    const caseDocumentId = "c49edc26-0265-4d1a-a85d-82313f6c3ce8";
    const fileName = "ud-100-complaint-unlawful-detainer copy.pdf";
    const pdf = await readFile(
      "examples/real-estate-eviction-unlawful-detainer/pdfs/ud-100-complaint-unlawful-detainer copy.pdf",
    );
    const { ensureCurrentFirmMistralOcrConversion } = await import(
      "@/lib/server/documents/ocr-conversions-service"
    );
    const { shapeCurrentUserWorkspaceFromOcr } = await import(
      "@/lib/server/workflows/shape/action"
    );
    const { getCurrentUserCaseWorkspaceById } = await import(
      "@/lib/server/case-workspace/service"
    );

    const conversion = await ensureCurrentFirmMistralOcrConversion({
      content: pdf,
      fileName,
    });

    expect(conversion.conversion.documentAnnotation).not.toBeNull();

    const shape = await shapeCurrentUserWorkspaceFromOcr({
      caseId,
      files: [
        {
          caseDocumentId,
          fileName,
          ocrConversionId: conversion.conversion.id,
        },
      ],
    });

    expect(shape.ok).toBe(true);

    const workspace = await getCurrentUserCaseWorkspaceById(caseId);

    expect(workspace.ok).toBe(true);
    if (!workspace.ok) {
      return;
    }

    const titles = workspace.workspace.reviewActions.map((action) => action.title);

    expect(titles).toContain("Premises address not filled in");
    expect(titles).toContain("Notice expiration date missing");
    expect(titles).toContain("Plaintiff verification signature missing");
  }, 180_000);
});
