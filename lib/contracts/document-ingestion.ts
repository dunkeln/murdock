import { z } from "zod";

export const documentIngestionErrorSchema = z.object({
  isError: z.literal(true),
  errorCategory: z.enum(["configuration", "validation", "provider", "unknown"]),
  isRetryable: z.boolean(),
  message: z.string(),
});

export type DocumentIngestionError = z.infer<typeof documentIngestionErrorSchema>;

export const mistralOcrPageSchema = z.object({
  index: z.number().int().nonnegative(),
  markdown: z.string(),
  dimensions: z
    .object({
      dpi: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
      width: z.number().int().positive().nullable(),
    })
    .nullable(),
  images: z.array(
    z.object({
      id: z.string().min(1),
      topLeftX: z.number().nullable(),
      topLeftY: z.number().nullable(),
      bottomRightX: z.number().nullable(),
      bottomRightY: z.number().nullable(),
      imageBase64: z.string().min(1).nullable(),
      imageAnnotation: z.string().min(1).nullable(),
    }),
  ),
});

export type MistralOcrPage = z.infer<typeof mistralOcrPageSchema>;

export const mistralOcrResultSchema = z.object({
  model: z.string(),
  pages: z.array(mistralOcrPageSchema),
  markdown: z.string(),
  documentAnnotation: z.unknown().nullable().default(null),
  usage: z.object({
    pagesProcessed: z.number().int().nonnegative(),
    docSizeBytes: z.number().int().nonnegative().nullable(),
  }),
});

export type MistralOcrResult = z.infer<typeof mistralOcrResultSchema>;

export const mistralUploadedDocumentSchema = z.object({
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  signedUrl: z.url(),
});

export type MistralUploadedDocument = z.infer<typeof mistralUploadedDocumentSchema>;

export type DocumentIngestionResult<T> =
  | { isError: false; data: T }
  | DocumentIngestionError;

export const ocrDocumentUrlInputSchema = z.object({
  documentUrl: z.url(),
  documentName: z.string().min(1).optional(),
  includeImageBase64: z.boolean().default(false),
});

export type OcrDocumentUrlInput = z.input<typeof ocrDocumentUrlInputSchema>;

export const ocrUploadedDocumentInputSchema = z.object({
  fileName: z.string().min(1),
  content: z.instanceof(Uint8Array).or(z.instanceof(ArrayBuffer)).or(z.instanceof(Blob)),
  includeImageBase64: z.boolean().default(false),
});

export type OcrUploadedDocumentInput = z.input<typeof ocrUploadedDocumentInputSchema>;
