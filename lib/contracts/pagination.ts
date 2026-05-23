import { z } from "zod";

import { isoDateTimeSchema } from "@/lib/contracts/cases";

export const pageLimitSchema = z.number().int().min(1).max(100).default(25);

export const timestampCursorSchema = z.object({
  updatedAt: isoDateTimeSchema,
  id: z.uuid(),
});

export type TimestampCursor = z.infer<typeof timestampCursorSchema>;

export const timestampPageInputSchema = z.object({
  limit: pageLimitSchema,
  cursor: timestampCursorSchema.nullable().default(null),
});

export type TimestampPageInput = z.input<typeof timestampPageInputSchema>;

export const pageInfoDtoSchema = z.object({
  hasNextPage: z.boolean(),
  nextCursor: timestampCursorSchema.nullable(),
});

export type PageInfoDto = z.infer<typeof pageInfoDtoSchema>;

export function paginatedDtoSchema<TItem extends z.ZodType>(itemSchema: TItem) {
  return z.object({
    items: z.array(itemSchema),
    pageInfo: pageInfoDtoSchema,
  });
}
