export type IngestedFileOcrStatus =
  | "processing"
  | "ready"
  | "cached"
  | "failed";

export type IngestedFileItem = {
  caseDocumentId?: string | null;
  caseId?: string;
  documentSha256?: string | null;
  errorMessage?: string;
  expiresAt?: string;
  file: File;
  fileName: string;
  fileSizeBytes?: number | null;
  id: string;
  mimeType?: string | null;
  ocrConversionId?: string;
  ocrStatus: IngestedFileOcrStatus;
  pagesProcessed?: number | null;
  shapingErrorMessage?: string;
  shapingRunId?: string;
  shapingStatus?:
    | "idle"
    | "shaping_pending"
    | "shaping_started"
    | "ready"
    | "needs_review"
    | "failed";
};
