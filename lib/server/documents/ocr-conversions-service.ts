import "server-only";

import {
  type EnsureOcrConversionInput,
  type OcrConversionDto,
  ensureOcrConversionInputSchema,
} from "@/lib/contracts/ocr-conversions";
import {
  MISTRAL_OCR_MODEL,
  uploadAndAnnotateDocumentForHarnessV2,
  uploadAndOcrDocument,
} from "@/lib/server/adapters/mistral";
import { getCurrentUser } from "@/lib/server/auth/current-user";
import { sha256Hex, toUint8Array } from "@/lib/server/documents/content";
import {
  claimRefreshableOcrConversion,
  getActiveOcrConversion,
  insertProcessingOcrConversion,
  markOcrConversionFailed,
  markOcrConversionReady,
} from "@/lib/server/documents/ocr-conversions-repository";
import {
  withLangfuseObservation,
  withLangfuseTrace,
} from "@/lib/server/telemetry/langfuse";
import { selectedHarnessWorkflow } from "@/lib/server/workflows/shape/version";

const OCR_PROVIDER = "mistral";

export type EnsureOcrConversionSource =
  | "cache"
  | "created"
  | "in_progress"
  | "refreshed";

export type EnsureOcrConversionResult = {
  conversion: OcrConversionDto;
  source: EnsureOcrConversionSource;
};

function isReadyAndFresh(conversion: OcrConversionDto): boolean {
  return (
    conversion.status === "ready" &&
    conversion.markdown !== null &&
    new Date(conversion.expiresAt).getTime() > Date.now()
  );
}

function isReadyForSelectedWorkflow(conversion: OcrConversionDto): boolean {
  return (
    isReadyAndFresh(conversion) &&
    (!shouldUseHarnessV2Annotations() || conversion.documentAnnotation !== null)
  );
}

function getFileExtension(fileName: string) {
  const extension = fileName.split(".").pop();

  return extension && extension !== fileName ? extension.toLowerCase() : "none";
}

function shouldUseHarnessV2Annotations() {
  return selectedHarnessWorkflow() !== "v1";
}

export async function ensureCurrentFirmMistralOcrConversion(
  input: EnsureOcrConversionInput
): Promise<EnsureOcrConversionResult> {
  const parsedInput = ensureOcrConversionInputSchema.parse(input);
  const user = await getCurrentUser();
  const content = await withLangfuseObservation(
    {
      name: "ocr.content-read",
      input: {
        fileExtension: getFileExtension(parsedInput.fileName),
      },
      metadata: {
        fileExtension: getFileExtension(parsedInput.fileName),
      },
      output: (contentResult) => ({
        byteLength: contentResult.byteLength,
      }),
    },
    () => toUint8Array(parsedInput.content)
  );
  const documentSha256 = sha256Hex(content);

  return withLangfuseTrace(
    {
      name: "ocr.ensure-conversion",
      userId: user.id,
      sessionId: `firm:${user.firmId}:ocr`,
      tags: ["ocr", OCR_PROVIDER],
      input: {
        fileExtension: getFileExtension(parsedInput.fileName),
        byteLength: content.byteLength,
      },
      metadata: {
        documentSha256,
        firmId: user.firmId,
        provider: OCR_PROVIDER,
        providerModel: MISTRAL_OCR_MODEL,
      },
      output: (result) => ({
        conversionId: result.conversion.id,
        source: result.source,
        status: result.conversion.status,
        pagesProcessed: result.conversion.pagesProcessed,
      }),
    },
    async () => {
      const existingConversion = await withLangfuseObservation(
        {
          name: "ocr.lookup-active-conversion",
          metadata: {
            documentSha256,
            firmId: user.firmId,
            provider: OCR_PROVIDER,
            providerModel: MISTRAL_OCR_MODEL,
          },
          output: (conversion) => ({
            found: Boolean(conversion),
            fresh: conversion ? isReadyAndFresh(conversion) : false,
            readyForSelectedWorkflow: conversion
              ? isReadyForSelectedWorkflow(conversion)
              : false,
            status: conversion?.status ?? null,
          }),
        },
        () =>
          getActiveOcrConversion({
            firmId: user.firmId,
            documentSha256,
            provider: OCR_PROVIDER,
            providerModel: MISTRAL_OCR_MODEL,
          })
      );

      if (existingConversion && isReadyForSelectedWorkflow(existingConversion)) {
        return {
          conversion: existingConversion,
          source: "cache",
        };
      }

      const insertedConversion = await withLangfuseObservation(
        {
          name: "ocr.insert-processing-conversion",
          metadata: {
            documentSha256,
            firmId: user.firmId,
            provider: OCR_PROVIDER,
            providerModel: MISTRAL_OCR_MODEL,
          },
          output: (conversion) => ({
            inserted: Boolean(conversion),
            conversionId: conversion?.id ?? null,
          }),
        },
        () =>
          insertProcessingOcrConversion({
            firmId: user.firmId,
            documentSha256,
            provider: OCR_PROVIDER,
            providerModel: MISTRAL_OCR_MODEL,
          })
      );

      if (insertedConversion) {
        return processOcrConversion({
          conversion: insertedConversion,
          fileName: parsedInput.fileName,
          content,
          source: "created",
        });
      }

      const claimedConversion = await withLangfuseObservation(
        {
          name: "ocr.claim-refreshable-conversion",
          metadata: {
            documentSha256,
            firmId: user.firmId,
            provider: OCR_PROVIDER,
            providerModel: MISTRAL_OCR_MODEL,
          },
          output: (conversion) => ({
            claimed: Boolean(conversion),
            conversionId: conversion?.id ?? null,
          }),
        },
        () =>
          claimRefreshableOcrConversion({
            firmId: user.firmId,
            documentSha256,
            provider: OCR_PROVIDER,
            providerModel: MISTRAL_OCR_MODEL,
            requiresDocumentAnnotation: shouldUseHarnessV2Annotations(),
          })
      );

      if (claimedConversion) {
        return processOcrConversion({
          conversion: claimedConversion,
          fileName: parsedInput.fileName,
          content,
          source: "refreshed",
        });
      }

      const currentConversion = await withLangfuseObservation(
        {
          name: "ocr.reload-active-conversion",
          metadata: {
            documentSha256,
            firmId: user.firmId,
            provider: OCR_PROVIDER,
            providerModel: MISTRAL_OCR_MODEL,
          },
          output: (conversion) => ({
            found: Boolean(conversion),
            status: conversion?.status ?? null,
          }),
        },
        () =>
          getActiveOcrConversion({
            firmId: user.firmId,
            documentSha256,
            provider: OCR_PROVIDER,
            providerModel: MISTRAL_OCR_MODEL,
          })
      );

      if (currentConversion) {
        return {
          conversion: currentConversion,
          source:
            currentConversion.status === "processing"
              ? "in_progress"
              : "cache",
        };
      }

      throw new Error("Unable to create or load OCR conversion.");
    }
  );
}

async function processOcrConversion(input: {
  content: Uint8Array<ArrayBuffer>;
  conversion: OcrConversionDto;
  fileName: string;
  source: Exclude<EnsureOcrConversionSource, "cache" | "in_progress">;
}): Promise<EnsureOcrConversionResult> {
  return withLangfuseObservation(
    {
      name: "ocr.process-conversion",
      input: {
        conversionId: input.conversion.id,
        fileExtension: getFileExtension(input.fileName),
        source: input.source,
      },
      metadata: {
        conversionId: input.conversion.id,
        provider: OCR_PROVIDER,
        providerModel: MISTRAL_OCR_MODEL,
      },
      output: (result) => ({
        conversionId: result.conversion.id,
        source: result.source,
        status: result.conversion.status,
        pagesProcessed: result.conversion.pagesProcessed,
      }),
    },
    async () => {
      const ocrResult = await withLangfuseObservation(
        {
          name: "mistral.ocr",
          input: {
            fileExtension: getFileExtension(input.fileName),
            byteLength: input.content.byteLength,
            model: MISTRAL_OCR_MODEL,
          },
          metadata: {
            conversionId: input.conversion.id,
            provider: OCR_PROVIDER,
            providerModel: MISTRAL_OCR_MODEL,
          },
          output: (result) => ({
            isError: result.isError,
            errorCategory: result.isError ? result.errorCategory : null,
            pagesProcessed: result.isError
              ? null
              : result.data.usage.pagesProcessed,
          }),
        },
        () =>
          (shouldUseHarnessV2Annotations()
            ? uploadAndAnnotateDocumentForHarnessV2
            : uploadAndOcrDocument)({
            fileName: input.fileName,
            content: input.content,
          })
      );

      if (ocrResult.isError) {
        const conversion = await withLangfuseObservation(
          {
            name: "ocr.mark-failed",
            input: {
              conversionId: input.conversion.id,
              errorCategory: ocrResult.errorCategory,
              isRetryable: ocrResult.isRetryable,
            },
            metadata: {
              conversionId: input.conversion.id,
              errorCategory: ocrResult.errorCategory,
              provider: OCR_PROVIDER,
            },
            output: (conversionResult) => ({
              conversionId: conversionResult.id,
              status: conversionResult.status,
            }),
          },
          () =>
            markOcrConversionFailed({
              conversionId: input.conversion.id,
              errorMessage: ocrResult.message,
            })
        );

        return {
          conversion,
          source: input.source,
        };
      }

      const conversion = await withLangfuseObservation(
        {
          name: "ocr.mark-ready",
          input: {
            conversionId: input.conversion.id,
            pagesProcessed: ocrResult.data.usage.pagesProcessed,
          },
          metadata: {
            conversionId: input.conversion.id,
            provider: OCR_PROVIDER,
          },
          output: (conversionResult) => ({
            conversionId: conversionResult.id,
            status: conversionResult.status,
            pagesProcessed: conversionResult.pagesProcessed,
          }),
        },
        () =>
          markOcrConversionReady({
            conversionId: input.conversion.id,
            documentAnnotation: ocrResult.data.documentAnnotation,
            markdown: ocrResult.data.markdown,
            pagesProcessed: ocrResult.data.usage.pagesProcessed,
          })
      );

      return {
        conversion,
        source: input.source,
      };
    }
  );
}
