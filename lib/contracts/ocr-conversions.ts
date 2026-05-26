import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";

export const ocrProviderSchema = z.enum(["mistral"]);

export type OcrProvider = z.infer<typeof ocrProviderSchema>;

export const ocrConversionStatusSchema = z.enum([
  "pending",
  "processing",
  "ready",
  "failed",
]);

export type OcrConversionStatus = z.infer<typeof ocrConversionStatusSchema>;

export const documentSha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Expected lowercase SHA-256 hex digest.");

export const ocrConversionDtoSchema = z.object({
  id: z.uuid(),
  firmId: z.string().min(1),
  documentSha256: documentSha256Schema,
  provider: ocrProviderSchema,
  providerModel: z.string().min(1),
  status: ocrConversionStatusSchema,
  markdown: z.string().nullable(),
  documentAnnotation: z.unknown().nullable().default(null),
  pagesProcessed: z.number().int().nonnegative().nullable(),
  errorMessage: z.string().nullable(),
  expiresAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type OcrConversionDto = z.infer<typeof ocrConversionDtoSchema>;

export const ensureOcrConversionInputSchema = z.object({
  fileName: z.string().min(1),
  content: z
    .instanceof(Uint8Array)
    .or(z.instanceof(ArrayBuffer))
    .or(z.instanceof(Blob)),
});

export type EnsureOcrConversionInput = z.input<
  typeof ensureOcrConversionInputSchema
>;
