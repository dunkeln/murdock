import "server-only";

import {
  type EnsureOcrConversionInput,
  type OcrConversionDto,
  ensureOcrConversionInputSchema,
} from "@/lib/contracts/ocr-conversions";
import { MISTRAL_OCR_MODEL, uploadAndOcrDocument } from "@/lib/server/adapters/mistral";
import { getCurrentUser } from "@/lib/server/auth/current-user";
import { sha256Hex, toUint8Array } from "@/lib/server/documents/content";
import {
  getActiveOcrConversion,
  markOcrConversionFailed,
  markOcrConversionReady,
  upsertProcessingOcrConversion,
} from "@/lib/server/documents/ocr-conversions-repository";

const OCR_PROVIDER = "mistral";

function isReadyAndFresh(conversion: OcrConversionDto): boolean {
  return (
    conversion.status === "ready" &&
    conversion.markdown !== null &&
    new Date(conversion.expiresAt).getTime() > Date.now()
  );
}

export async function ensureCurrentFirmMistralOcrConversion(
  input: EnsureOcrConversionInput
): Promise<OcrConversionDto> {
  const parsedInput = ensureOcrConversionInputSchema.parse(input);
  const user = await getCurrentUser();
  const content = await toUint8Array(parsedInput.content);
  const documentSha256 = sha256Hex(content);
  const existingConversion = await getActiveOcrConversion({
    firmId: user.firmId,
    documentSha256,
    provider: OCR_PROVIDER,
    providerModel: MISTRAL_OCR_MODEL,
  });

  if (existingConversion && isReadyAndFresh(existingConversion)) {
    return existingConversion;
  }

  const processingConversion = await upsertProcessingOcrConversion({
    firmId: user.firmId,
    documentSha256,
    provider: OCR_PROVIDER,
    providerModel: MISTRAL_OCR_MODEL,
  });
  const ocrResult = await uploadAndOcrDocument({
    fileName: parsedInput.fileName,
    content,
  });

  if (ocrResult.isError) {
    return markOcrConversionFailed({
      conversionId: processingConversion.id,
      errorMessage: ocrResult.message,
    });
  }

  return markOcrConversionReady({
    conversionId: processingConversion.id,
    markdown: ocrResult.data.markdown,
    pagesProcessed: ocrResult.data.usage.pagesProcessed,
  });
}
