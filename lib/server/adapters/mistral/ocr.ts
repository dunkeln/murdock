import "server-only";

import { FilePurpose } from "@mistralai/mistralai/models/components";

import {
  type DocumentIngestionError,
  type DocumentIngestionResult,
  type MistralOcrResult,
  type MistralUploadedDocument,
  type OcrDocumentUrlInput,
  type OcrUploadedDocumentInput,
  mistralOcrResultSchema,
  mistralUploadedDocumentSchema,
  ocrDocumentUrlInputSchema,
  ocrUploadedDocumentInputSchema,
} from "@/lib/contracts/document-ingestion";
import { createMistralClient } from "@/lib/server/adapters/mistral/client";

const MISTRAL_OCR_MODEL = "mistral-ocr-latest";

function toIngestionError(error: unknown): DocumentIngestionError {
  const message = error instanceof Error ? error.message : "Unexpected Mistral adapter failure.";
  const isConfigurationError = message.includes("MISTRAL_API_KEY");

  return {
    isError: true,
    errorCategory: isConfigurationError ? "configuration" : "provider",
    isRetryable: !isConfigurationError,
    message,
  };
}

function toOcrResult(response: Awaited<ReturnType<ReturnType<typeof createMistralClient>["ocr"]["process"]>>): MistralOcrResult {
  return mistralOcrResultSchema.parse({
    model: response.model,
    pages: response.pages.map((page) => ({
      index: page.index,
      markdown: page.markdown,
    })),
    markdown: response.pages.map((page) => page.markdown).join("\n\n"),
    usage: {
      pagesProcessed: response.usageInfo.pagesProcessed,
      docSizeBytes: response.usageInfo.docSizeBytes ?? null,
    },
  });
}

export async function ocrDocumentUrl(
  input: OcrDocumentUrlInput
): Promise<DocumentIngestionResult<MistralOcrResult>> {
  const parsedInput = ocrDocumentUrlInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return {
      isError: true,
      errorCategory: "validation",
      isRetryable: false,
      message: parsedInput.error.message,
    };
  }

  try {
    const client = createMistralClient();
    const response = await client.ocr.process({
      model: MISTRAL_OCR_MODEL,
      document: {
        type: "document_url",
        documentUrl: parsedInput.data.documentUrl,
        documentName: parsedInput.data.documentName,
      },
      includeImageBase64: parsedInput.data.includeImageBase64,
    });

    return { isError: false, data: toOcrResult(response) };
  } catch (error) {
    return toIngestionError(error);
  }
}

export async function uploadDocumentForOcr(
  input: OcrUploadedDocumentInput
): Promise<DocumentIngestionResult<MistralUploadedDocument>> {
  const parsedInput = ocrUploadedDocumentInputSchema.safeParse(input);

  if (!parsedInput.success) {
    return {
      isError: true,
      errorCategory: "validation",
      isRetryable: false,
      message: parsedInput.error.message,
    };
  }

  try {
    const client = createMistralClient();
    const uploadedFile = await client.files.upload({
      purpose: FilePurpose.Ocr,
      file: {
        fileName: parsedInput.data.fileName,
        content: parsedInput.data.content,
      },
    });
    const signedUrl = await client.files.getSignedUrl({ fileId: uploadedFile.id });

    return {
      isError: false,
      data: mistralUploadedDocumentSchema.parse({
        fileId: uploadedFile.id,
        fileName: uploadedFile.filename,
        sizeBytes: uploadedFile.sizeBytes,
        signedUrl: signedUrl.url,
      }),
    };
  } catch (error) {
    return toIngestionError(error);
  }
}

export async function uploadAndOcrDocument(
  input: OcrUploadedDocumentInput
): Promise<DocumentIngestionResult<MistralOcrResult>> {
  const uploadResult = await uploadDocumentForOcr(input);

  if (uploadResult.isError) {
    return uploadResult;
  }

  return ocrDocumentUrl({
    documentUrl: uploadResult.data.signedUrl,
    documentName: uploadResult.data.fileName,
    includeImageBase64: input.includeImageBase64 ?? false,
  });
}
