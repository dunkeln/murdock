export type IngestedFileOcrStatus =
  | "processing"
  | "ready"
  | "cached"
  | "failed";

export type IngestedFileItem = {
  errorMessage?: string;
  expiresAt?: string;
  file: File;
  id: string;
  ocrConversionId?: string;
  ocrStatus: IngestedFileOcrStatus;
  pagesProcessed?: number | null;
};
