import "server-only";

import { z } from "zod";

export type JsonObjectSchema = Record<string, unknown> & {
  type: "object";
};

export function toObjectJsonSchema(schema: z.ZodType): JsonObjectSchema {
  const jsonSchema = z.toJSONSchema(schema, {
    target: "draft-7",
  }) as Record<string, unknown>;

  if (jsonSchema.type !== "object") {
    throw new Error("Model structured output schema must be a Zod object.");
  }

  return jsonSchema as JsonObjectSchema;
}
