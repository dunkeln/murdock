import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { toConfigurationError, toModelError } from "@/lib/server/ai/errors";
import type {
  Provider,
  ProviderGenerateInput,
  ProviderGenerateResult,
} from "@/lib/server/ai/types";

const provider = "anthropic";

export const anthropicProvider: Provider = {
  id: provider,
  generateObject,
};

async function generateObject(
  input: ProviderGenerateInput,
): Promise<ProviderGenerateResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: toConfigurationError({
        message: "ANTHROPIC_API_KEY is not configured.",
        provider,
      }),
    };
  }

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const message = await client.messages.create({
      max_tokens: input.maxOutputTokens,
      messages: input.messages.map((messageItem) => ({
        role: messageItem.role,
        content: messageItem.content,
      })),
      model: input.model,
      system: input.system ?? undefined,
      temperature: input.temperature ?? undefined,
      tool_choice: {
        type: "tool",
        name: input.schemaName,
      },
      tools: [
        {
          name: input.schemaName,
          description: input.schemaDescription,
          input_schema: input.jsonSchema,
        },
      ],
    });
    const toolUse = message.content.find((block) => {
      return block.type === "tool_use" && block.name === input.schemaName;
    });

    if (!toolUse || toolUse.type !== "tool_use") {
      return {
        ok: false,
        error: toConfigurationError({
          message: "Anthropic response did not include the requested tool use.",
          provider,
        }),
      };
    }

    return {
      ok: true,
      data: toolUse.input,
      model: input.model,
      provider,
      usage: {
        inputTokens: message.usage.input_tokens ?? null,
        outputTokens: message.usage.output_tokens ?? null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: toModelError({ error, provider }),
    };
  }
}
