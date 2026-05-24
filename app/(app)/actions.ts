"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { updateCurrentUserCaseTitle } from "@/lib/server/cases/service";
import { ensureCurrentFirmMistralOcrConversion } from "@/lib/server/documents/ocr-conversions-service";

const updateCaseTitleActionInputSchema = z.object({
  caseId: z.uuid(),
  title: z.string().trim().min(1).max(120),
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

export type IngestDocumentOcrActionResult =
  | {
      cached: boolean;
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

function getOcrUploadFile(formData: FormData): File | null {
  const file = formData.get("file");

  return file instanceof File ? file : null;
}

export async function updateCaseTitleAction(
  formData: FormData
): Promise<UpdateCaseTitleActionResult> {
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

export async function ingestDocumentOcrAction(
  formData: FormData
): Promise<IngestDocumentOcrActionResult> {
  const file = getOcrUploadFile(formData);

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
    const result = await ensureCurrentFirmMistralOcrConversion({
      fileName: file.name,
      content: file,
    });

    return {
      ok: true,
      cached: result.source === "cache",
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
