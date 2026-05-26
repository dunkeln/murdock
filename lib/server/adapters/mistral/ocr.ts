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
import {
  HARNESS_V2_DOCUMENT_ANNOTATION_PROMPT,
  harnessV2AnnotationResponseFormat,
} from "@/lib/server/harness/workflows/v2/annotate";

export const MISTRAL_OCR_MODEL = "mistral-ocr-latest";

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
    documentAnnotation: response.documentAnnotation
      ? JSON.parse(response.documentAnnotation)
      : null,
    pages: response.pages.map((page) => ({
      index: page.index,
      markdown: page.markdown,
      dimensions: page.dimensions
        ? {
            dpi: page.dimensions.dpi ?? null,
            height: page.dimensions.height ?? null,
            width: page.dimensions.width ?? null,
          }
        : null,
      images: page.images.map((image) => ({
        id: image.id,
        topLeftX: image.topLeftX,
        topLeftY: image.topLeftY,
        bottomRightX: image.bottomRightX,
        bottomRightY: image.bottomRightY,
        imageBase64: image.imageBase64 ?? null,
        imageAnnotation: image.imageAnnotation ?? null,
      })),
    })),
    markdown: response.pages.map((page) => page.markdown).join("\n\n"),
    usage: {
      pagesProcessed: response.usageInfo.pagesProcessed,
      docSizeBytes: response.usageInfo.docSizeBytes ?? null,
    },
  });
}

async function ocrDocumentUrl(
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

async function uploadDocumentForOcr(
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

async function ocrDocumentUrlWithHarnessV2Annotation(
  input: OcrDocumentUrlInput,
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
      documentAnnotationFormat: harnessV2AnnotationResponseFormat(),
      documentAnnotationPrompt: HARNESS_V2_DOCUMENT_ANNOTATION_PROMPT,
      includeImageBase64: parsedInput.data.includeImageBase64,
    });

    return { isError: false, data: toOcrResult(response) };
  } catch (error) {
    return toIngestionError(error);
  }
}

export async function uploadAndAnnotateDocumentForHarnessV2(
  input: OcrUploadedDocumentInput,
): Promise<DocumentIngestionResult<MistralOcrResult>> {
  const uploadResult = await uploadDocumentForOcr(input);

  if (uploadResult.isError) {
    return uploadResult;
  }

  return ocrDocumentUrlWithHarnessV2Annotation({
    documentUrl: uploadResult.data.signedUrl,
    documentName: uploadResult.data.fileName,
    includeImageBase64: input.includeImageBase64 ?? false,
  });
}
