import "server-only";

import { z } from "zod";

import type { ControlStatus } from "@/lib/agui";
import type { HarnessError } from "@/lib/contracts/harness";

export const inputSchema = z.object({
  caseId: z.uuid(),
  files: z
    .array(
      z.object({
        fileName: z.string().min(1),
        ocrConversionId: z.uuid(),
      }),
    )
    .min(1),
});

export type ShapeInput = z.infer<typeof inputSchema>;

export const errorSchema = z.object({
  isError: z.literal(true),
  errorCategory: z.enum([
    "configuration",
    "not_found",
    "ocr_not_ready",
    "provider",
    "schema_validation",
    "database",
    "unknown",
  ]),
  isRetryable: z.boolean(),
  message: z.string().min(1),
});

export type ShapeError = z.infer<typeof errorSchema>;

export type ShapeResult =
  | {
      caseId: string;
      events: import("@ag-ui/core").AGUIEvent[];
      ok: true;
      runId: string;
      status: ControlStatus;
    }
  | {
      caseId: string;
      error: ShapeError;
      events: import("@ag-ui/core").AGUIEvent[];
      ok: false;
      runId: string;
      status: ControlStatus;
    };

export function getSourceKey(conversionId: string) {
  return `ocr-${conversionId}`;
}

export function safeKey(...parts: string[]) {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function toShapeError(error: unknown): ShapeError {
  if (error instanceof Error) {
    if (error.message.includes("ANTHROPIC_API_KEY")) {
      return errorSchema.parse({
        isError: true,
        errorCategory: "configuration",
        isRetryable: false,
        message: "Anthropic is not configured for workspace shaping.",
      });
    }

    if (error.message.includes("NEON_CONN_URL")) {
      return errorSchema.parse({
        isError: true,
        errorCategory: "configuration",
        isRetryable: false,
        message: "Workspace shaping requires database configuration.",
      });
    }
  }

  return errorSchema.parse({
    isError: true,
    errorCategory: "unknown",
    isRetryable: true,
    message: "Workspace shaping failed unexpectedly.",
  });
}

export function fromHarnessError(error: HarnessError): ShapeError {
  return errorSchema.parse({
    isError: true,
    errorCategory:
      error.errorCategory === "schema_validation"
        ? "schema_validation"
        : error.errorCategory === "configuration"
          ? "configuration"
          : error.errorCategory === "ocr_not_ready"
            ? "ocr_not_ready"
            : "provider",
    isRetryable: error.isRetryable,
    message: error.message,
  });
}
