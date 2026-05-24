import "server-only";

import { z } from "zod";

import {
  type GenerateObjectResult,
  type Message,
  messageSchema,
  schemaNameSchema,
} from "@/lib/ai";
import {
  toConfigurationError,
  toSchemaValidationError,
} from "@/lib/server/ai/errors";
import { anthropicProvider } from "@/lib/server/ai/providers/anthropic";
import { openaiProvider } from "@/lib/server/ai/providers/openai";
import { selectModelRoutes } from "@/lib/server/ai/router";
import { toObjectJsonSchema } from "@/lib/server/ai/schema";
import type { Provider, ProviderGenerateInput } from "@/lib/server/ai/types";

const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

const providers: Record<string, Provider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

export type GenerateObjectInput<TSchema extends z.ZodType> = {
  maxOutputTokens?: number;
  messages: Message[];
  model?: string;
  preferredProvider?: string | null;
  schema: TSchema;
  schemaDescription?: string;
  schemaName: string;
  system?: string | null;
  temperature?: number | null;
  use?: string;
};

export async function generateObject<TSchema extends z.ZodType>(
  input: GenerateObjectInput<TSchema>,
): Promise<GenerateObjectResult<z.infer<TSchema>>> {
  const schemaName = schemaNameSchema.parse(input.schemaName);
  const messages = z.array(messageSchema).min(1).parse(input.messages);
  const routesResult = selectModelRoutes({
    preferredProvider: input.preferredProvider ?? null,
    use: input.use ?? "canonical-shaping",
  });

  if (!routesResult.ok) {
    return {
      ok: false,
      error: toConfigurationError({
        message: routesResult.error.message,
        provider: null,
      }),
    };
  }

  const jsonSchema = toObjectJsonSchema(input.schema);
  let lastRetryableError: GenerateObjectResult<z.infer<TSchema>> | null = null;

  for (const route of routesResult.routes) {
    const provider = providers[route.provider];

    if (!provider) {
      lastRetryableError = {
        ok: false,
        error: toConfigurationError({
          message: `No adapter registered for provider ${route.provider}.`,
          provider: route.provider,
        }),
      };
      continue;
    }

    const model = input.model ?? route.model;

    if (!model) {
      lastRetryableError = {
        ok: false,
        error: toConfigurationError({
          message: `No model configured for provider ${route.provider}.`,
          provider: route.provider,
        }),
      };
      continue;
    }

    const providerInput: ProviderGenerateInput & { schema: TSchema } = {
      jsonSchema,
      maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      messages,
      model,
      schema: input.schema,
      schemaDescription:
        input.schemaDescription ??
        "Return only the structured object requested by this schema.",
      schemaName,
      system: input.system ?? null,
      temperature: input.temperature ?? null,
    };
    const providerResult = await provider.generateObject(providerInput);

    if (!providerResult.ok) {
      if (providerResult.error.isRetryable) {
        lastRetryableError = providerResult;
        continue;
      }

      return providerResult;
    }

    const parsed = input.schema.safeParse(providerResult.data);

    if (!parsed.success) {
      return {
        ok: false,
        error: toSchemaValidationError({
          message: "Model output failed schema validation.",
          provider: providerResult.provider,
        }),
      };
    }

    return {
      ok: true,
      data: parsed.data,
      model: providerResult.model,
      provider: providerResult.provider,
      usage: providerResult.usage,
    };
  }

  return (
    lastRetryableError ?? {
      ok: false,
      error: toConfigurationError({
        message: "No configured model provider is available.",
        provider: null,
      }),
    }
  );
}
