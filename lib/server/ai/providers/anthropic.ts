import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type {
  CacheControlEphemeral,
  MessageParam,
  TextBlockParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";

import { toConfigurationError, toModelError } from "@/lib/server/ai/errors";
import type {
  Provider,
  ProviderGenerateInput,
  ProviderGenerateResult,
} from "@/lib/server/ai/types";

const provider = "anthropic";
const DEFAULT_PROMPT_CACHE_TTL = "5m";

export const anthropicProvider: Provider = {
  id: provider,
  generateObject,
};

function cacheControl(input: ProviderGenerateInput): CacheControlEphemeral | null {
  if (!input.promptCache?.enabled) {
    return null;
  }

  return {
    type: "ephemeral",
    ttl: input.promptCache.ttl ?? DEFAULT_PROMPT_CACHE_TTL,
  };
}

function systemParam(input: ProviderGenerateInput) {
  if (!input.system) {
    return undefined;
  }

  const control = cacheControl(input);

  if (!control) {
    return input.system;
  }

  return [
    {
      type: "text",
      text: input.system,
      cache_control: control,
    } satisfies TextBlockParam,
  ];
}

function messagesParam(input: ProviderGenerateInput): MessageParam[] {
  return input.messages.map((messageItem) => ({
    role: messageItem.role,
    content: messageItem.content,
  }));
}

function toolsParam(input: ProviderGenerateInput): Tool[] {
  const control = cacheControl(input);

  return [
    {
      name: input.schemaName,
      description: input.schemaDescription,
      input_schema: input.jsonSchema,
      ...(control && !input.system ? { cache_control: control } : {}),
    },
  ];
}

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
      messages: messagesParam(input),
      model: input.model,
      system: systemParam(input),
      temperature: input.temperature ?? undefined,
      tool_choice: {
        type: "tool",
        name: input.schemaName,
      },
      tools: toolsParam(input),
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
        cacheCreationEphemeral1hInputTokens:
          message.usage.cache_creation?.ephemeral_1h_input_tokens ?? null,
        cacheCreationEphemeral5mInputTokens:
          message.usage.cache_creation?.ephemeral_5m_input_tokens ?? null,
        cacheCreationInputTokens:
          message.usage.cache_creation_input_tokens ?? null,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? null,
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
