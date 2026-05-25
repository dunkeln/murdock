"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCurrentUser } from "@/lib/server/auth/current-user";
import {
  createCurrentUserCase,
  deleteCurrentUserCase,
  updateCurrentUserCaseTitle,
} from "@/lib/server/cases/service";
import { getCaseSummaryByUserAndId } from "@/lib/server/cases/repository";
import { storeUploadedCaseDocument } from "@/lib/server/documents/case-document-workspace-service";
import { ensureCurrentFirmMistralOcrConversion } from "@/lib/server/documents/ocr-conversions-service";
import { withLangfuseObservation } from "@/lib/server/telemetry/langfuse";
import {
  shapeCurrentUserWorkspaceFromOcr,
  shapeWorkspaceErrorSchema,
} from "@/lib/server/workflows/workspace-shaping";

const updateCaseTitleActionInputSchema = z.object({
  caseId: z.uuid(),
  title: z.string().trim().min(1).max(120),
});

const deleteCaseActionInputSchema = z.object({
  caseId: z.uuid(),
});

const ingestDocumentOcrActionInputSchema = z.object({
  caseId: z.uuid().nullable(),
});

const shapeWorkspaceFromOcrActionInputSchema = z.object({
  caseId: z.uuid(),
  files: z
    .array(
      z.object({
        caseDocumentId: z.uuid().nullable().optional(),
        fileName: z.string().min(1),
        ocrConversionId: z.uuid(),
      }),
    )
    .min(1),
});

const MAX_OCR_UPLOAD_BYTES = 10 * 1024 * 1024;

export type UpdateCaseTitleActionResult =
  | {
      ok: true;
      title: string;
    }
  | {
      ok: false;
      message: string;
    };

export type CreateCaseActionResult =
  | {
      caseId: string;
      ok: true;
      slug: string;
      title: string;
    }
  | {
      message: string;
      ok: false;
    };

export type DeleteCaseActionResult =
  | {
      ok: true;
      slug: string;
      title: string;
    }
  | {
      message: string;
      ok: false;
    };

export type IngestDocumentOcrActionResult =
  | {
      cached: boolean;
      caseDocumentId: string | null;
      conversionId: string;
      errorMessage: string | null;
      expiresAt: string;
      ok: true;
      pagesProcessed: number | null;
      status: "pending" | "processing" | "ready" | "failed";
    }
  | {
      message: string;
      ok: false;
    };

export type ShapeWorkspaceFromOcrActionResult =
  | {
      caseId: string;
      events: unknown[];
      ok: true;
      runId: string;
      status:
        | "idle"
        | "ocr_processing"
        | "shaping_pending"
        | "shaping_started"
        | "ready"
        | "needs_review"
        | "failed";
    }
  | {
      caseId: string | null;
      errorCategory:
        | "configuration"
        | "not_found"
        | "ocr_not_ready"
        | "provider"
        | "schema_validation"
        | "database"
        | "unknown";
      events: unknown[];
      isRetryable: boolean;
      message: string;
      ok: false;
      runId: string | null;
      status: "failed";
    };

function getOcrUploadFile(formData: FormData): File | null {
  const file = formData.get("file");

  return file instanceof File ? file : null;
}

export async function updateCaseTitleAction(
  formData: FormData
): Promise<UpdateCaseTitleActionResult> {
  return withLangfuseObservation(
    {
      name: "server-action.update-case-title",
      input: {
        caseId: formData.get("caseId"),
      },
      output: (result) => ({
        ok: result.ok,
      }),
    },
    async () => {
      const parsedInput = updateCaseTitleActionInputSchema.safeParse({
        caseId: formData.get("caseId"),
        title: formData.get("title"),
      });

      if (!parsedInput.success) {
        return {
          ok: false,
          message: "Case names must be 1-120 characters.",
        };
      }

      const updatedCase = await updateCurrentUserCaseTitle(parsedInput.data);

      if (!updatedCase) {
        return {
          ok: false,
          message: "Case not found.",
        };
      }

      revalidatePath("/dashboard");
      revalidatePath(`/case/${updatedCase.slug}`);

      return {
        ok: true,
        title: updatedCase.title,
      };
    }
  );
}

export async function createCaseAction(): Promise<CreateCaseActionResult> {
  return withLangfuseObservation(
    {
      name: "server-action.create-case",
      output: (result) => ({
        ok: result.ok,
      }),
    },
    async () => {
      try {
        const createdCase = await createCurrentUserCase({
          title: "Untitled case",
          type: "general",
        });

        revalidatePath("/dashboard");
        revalidatePath("/case");
        revalidatePath(`/case/${createdCase.slug}`);

        return {
          caseId: createdCase.id,
          ok: true,
          slug: createdCase.slug,
          title: createdCase.title,
        };
      } catch (error) {
        return {
          message:
            error instanceof Error ? error.message : "Case could not be created.",
          ok: false,
        };
      }
    }
  );
}

export async function deleteCaseAction(
  formData: FormData
): Promise<DeleteCaseActionResult> {
  return withLangfuseObservation(
    {
      name: "server-action.delete-case",
      input: {
        caseId: formData.get("caseId"),
      },
      output: (result) => ({
        ok: result.ok,
      }),
    },
    async () => {
      const parsedInput = deleteCaseActionInputSchema.safeParse({
        caseId: formData.get("caseId"),
      });

      if (!parsedInput.success) {
        return {
          message: "Case id is invalid.",
          ok: false,
        };
      }

      const deletedCase = await deleteCurrentUserCase(parsedInput.data.caseId);

      if (!deletedCase) {
        return {
          message: "Case not found.",
          ok: false,
        };
      }

      revalidatePath("/dashboard");
      revalidatePath("/case");
      revalidatePath(`/case/${deletedCase.slug}`);

      return {
        ok: true,
        slug: deletedCase.slug,
        title: deletedCase.title,
      };
    }
  );
}

export async function ingestDocumentOcrAction(
  formData: FormData
): Promise<IngestDocumentOcrActionResult> {
  return withLangfuseObservation(
    {
      name: "server-action.ingest-document-ocr",
      output: (result) => ({
        ok: result.ok,
        status: result.ok ? result.status : null,
        cached: result.ok ? result.cached : null,
      }),
    },
    async () => {
      const file = getOcrUploadFile(formData);
      const parsedInput = ingestDocumentOcrActionInputSchema.parse({
        caseId: formData.get("caseId") || null,
      });

      if (!file || file.size === 0) {
        return {
          ok: false,
          message: "Upload a non-empty document.",
        };
      }

      if (file.size > MAX_OCR_UPLOAD_BYTES) {
        return {
          ok: false,
          message: "Documents must be 10 MB or smaller for this upload path.",
        };
      }

      try {
        const user = await getCurrentUser();
        const result = await ensureCurrentFirmMistralOcrConversion({
          fileName: file.name,
          content: file,
        });
        let caseDocumentId: string | null = null;

        if (parsedInput.caseId) {
          const caseSummary = await getCaseSummaryByUserAndId({
            caseId: parsedInput.caseId,
            userId: user.id,
          });

          if (!caseSummary) {
            return {
              ok: false,
              message: "Case not found.",
            };
          }

          const caseDocument = await storeUploadedCaseDocument({
            caseId: parsedInput.caseId,
            conversion: result.conversion,
            file,
            firmId: user.firmId,
          });

          caseDocumentId = caseDocument.id;
        }

        return {
          ok: true,
          cached: result.source === "cache",
          caseDocumentId,
          conversionId: result.conversion.id,
          errorMessage: result.conversion.errorMessage,
          expiresAt: result.conversion.expiresAt,
          pagesProcessed: result.conversion.pagesProcessed,
          status: result.conversion.status,
        };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "OCR ingestion failed unexpectedly.",
        };
      }
    }
  );
}

export async function shapeWorkspaceFromOcrAction(
  formData: FormData,
): Promise<ShapeWorkspaceFromOcrActionResult> {
  return withLangfuseObservation(
    {
      name: "server-action.shape-workspace-from-ocr",
      input: {
        caseId: formData.get("caseId"),
      },
      output: (result) => ({
        ok: result.ok,
        status: result.status,
        eventCount: result.events.length,
        errorCategory: result.ok ? null : result.errorCategory,
      }),
    },
    async () => {
      const rawFiles = formData.getAll("files").map((value) => {
        if (typeof value !== "string") {
          return null;
        }

        try {
          return JSON.parse(value) as unknown;
        } catch {
          return null;
        }
      });
      const parsedInput = shapeWorkspaceFromOcrActionInputSchema.safeParse({
        caseId: formData.get("caseId"),
        files: rawFiles,
      });

      if (!parsedInput.success) {
        return {
          ok: false,
          caseId:
            typeof formData.get("caseId") === "string"
              ? String(formData.get("caseId"))
              : null,
          errorCategory: "schema_validation",
          events: [],
          isRetryable: false,
          message: "Workspace shaping requires a case and ready OCR files.",
          runId: null,
          status: "failed",
        };
      }

      const result = await shapeCurrentUserWorkspaceFromOcr(parsedInput.data);

      if (!result.ok) {
        const error = shapeWorkspaceErrorSchema.parse(result.error);

        return {
          ok: false,
          caseId: result.caseId,
          errorCategory: error.errorCategory,
          events: result.events,
          isRetryable: error.isRetryable,
          message: error.message,
          runId: result.runId,
          status: "failed",
        };
      }

      revalidatePath(`/case/${parsedInput.data.caseId}`);

      return {
        ok: true,
        caseId: result.caseId,
        events: result.events,
        runId: result.runId,
        status: result.status,
      };
    },
  );
}
