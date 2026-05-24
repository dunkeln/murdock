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
  claimRefreshableOcrConversion,
  getActiveOcrConversion,
  insertProcessingOcrConversion,
  markOcrConversionFailed,
  markOcrConversionReady,
} from "@/lib/server/documents/ocr-conversions-repository";

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

export async function ensureCurrentFirmMistralOcrConversion(
  input: EnsureOcrConversionInput
): Promise<EnsureOcrConversionResult> {
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
    return {
      conversion: existingConversion,
      source: "cache",
    };
  }

  const insertedConversion = await insertProcessingOcrConversion({
    firmId: user.firmId,
    documentSha256,
    provider: OCR_PROVIDER,
    providerModel: MISTRAL_OCR_MODEL,
  });

  if (insertedConversion) {
    return processOcrConversion({
      conversion: insertedConversion,
      fileName: parsedInput.fileName,
      content,
      source: "created",
    });
  }

  const claimedConversion = await claimRefreshableOcrConversion({
    firmId: user.firmId,
    documentSha256,
    provider: OCR_PROVIDER,
    providerModel: MISTRAL_OCR_MODEL,
  });

  if (claimedConversion) {
    return processOcrConversion({
      conversion: claimedConversion,
      fileName: parsedInput.fileName,
      content,
      source: "refreshed",
    });
  }

  const currentConversion = await getActiveOcrConversion({
    firmId: user.firmId,
    documentSha256,
    provider: OCR_PROVIDER,
    providerModel: MISTRAL_OCR_MODEL,
  });

  if (currentConversion) {
    return {
      conversion: currentConversion,
      source:
        currentConversion.status === "processing" ? "in_progress" : "cache",
    };
  }

  throw new Error("Unable to create or load OCR conversion.");
}

async function processOcrConversion(input: {
  content: Uint8Array<ArrayBuffer>;
  conversion: OcrConversionDto;
  fileName: string;
  source: Exclude<EnsureOcrConversionSource, "cache" | "in_progress">;
}): Promise<EnsureOcrConversionResult> {
  const ocrResult = await uploadAndOcrDocument({
    fileName: input.fileName,
    content: input.content,
  });

  if (ocrResult.isError) {
    const conversion = await markOcrConversionFailed({
      conversionId: input.conversion.id,
      errorMessage: ocrResult.message,
    });

    return {
      conversion,
      source: input.source,
    };
  }

  const conversion = await markOcrConversionReady({
    conversionId: input.conversion.id,
    markdown: ocrResult.data.markdown,
    pagesProcessed: ocrResult.data.usage.pagesProcessed,
  });

  return {
    conversion,
    source: input.source,
  };
}
