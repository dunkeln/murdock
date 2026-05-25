import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { toConfigurationError, toModelError } from "@/lib/server/ai/errors";
import type {
  Provider,
  ProviderGenerateInput,
  ProviderGenerateResult,
} from "@/lib/server/ai/types";
import { z } from "zod";

const provider = "openai";

export const openaiProvider: Provider = {
  id: provider,
  generateObject,
};

async function generateObject(
  input: ProviderGenerateInput & { schema?: z.ZodType },
): Promise<ProviderGenerateResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      error: toConfigurationError({
        message: "OPENAI_API_KEY is not configured.",
        provider,
      }),
    };
  }

  if (!input.schema) {
    return {
      ok: false,
      error: toConfigurationError({
        message: "OpenAI structured output requires the source Zod schema.",
        provider,
      }),
    };
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const response = await client.responses.parse({
      input: [
        ...(input.system
          ? [{ role: "system" as const, content: input.system }]
          : []),
        ...input.messages.map((messageItem) => ({
          role: messageItem.role,
          content: messageItem.content,
        })),
      ],
      max_output_tokens: input.maxOutputTokens,
      model: input.model,
      temperature: input.temperature ?? undefined,
      text: {
        format: zodTextFormat(input.schema, input.schemaName),
      },
    });

    if (!response.output_parsed) {
      return {
        ok: false,
        error: toConfigurationError({
          message: "OpenAI response did not include parsed structured output.",
          provider,
        }),
      };
    }

    return {
      ok: true,
      data: response.output_parsed,
      model: input.model,
      provider,
      usage: {
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: toModelError({ error, provider }),
    };
  }
}
