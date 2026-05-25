import "server-only";

import type { OcrConversionDto } from "@/lib/contracts/ocr-conversions";
import {
  type CaseDocumentDto,
  upsertCaseDocument,
} from "@/lib/server/documents/case-documents-repository";
import { toUint8Array } from "@/lib/server/documents/content";

export async function storeUploadedCaseDocument(input: {
  caseId: string;
  conversion: OcrConversionDto;
  file: File;
  firmId: string;
}): Promise<CaseDocumentDto> {
  const bytes = await toUint8Array(input.file);

  return upsertCaseDocument({
    bytes,
    caseId: input.caseId,
    documentSha256: input.conversion.documentSha256,
    fileName: input.file.name,
    firmId: input.firmId,
    mimeType: input.file.type || "application/octet-stream",
    ocrConversionId: input.conversion.id,
    sizeBytes: input.file.size,
  });
}
