import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import OpenAI from "openai";

import type { GenerateObjectResult, Message } from "@/lib/ai";
import { toConfigurationError, toModelError } from "@/lib/server/ai/errors";
import { selectModelRoutes } from "@/lib/server/ai/router";
import type { ProviderId, Usage } from "@/lib/server/ai/types";

type StreamTextInput = {
  allowFallback?: boolean;
  maxOutputTokens?: number;
  messages: Message[];
  model?: string;
  onDelta?: (delta: string) => void | Promise<void>;
  preferredProvider?: string | null;
  system?: string | null;
  temperature?: number | null;
  use?: string;
};

type StreamTextResult = GenerateObjectResult<string>;

const DEFAULT_MAX_OUTPUT_TOKENS = 1200;

export async function streamText(
  input: StreamTextInput,
): Promise<StreamTextResult> {
  const routesResult = selectModelRoutes(
    {
      preferredProvider: input.preferredProvider ?? null,
      use: input.use ?? "workspace-query",
    },
    input.allowFallback === false ? "single" : "fallback",
  );

  if (!routesResult.ok) {
    return {
      ok: false,
      error: toConfigurationError({
        message: routesResult.error.message,
        provider: null,
      }),
    };
  }

  let lastRetryableError: StreamTextResult | null = null;

  for (const route of routesResult.routes) {
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

    const providerResult = await streamTextForProvider(route.provider as ProviderId, {
      ...input,
      maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      model,
    });

    if (!providerResult.ok) {
      if (providerResult.error.isRetryable) {
        lastRetryableError = providerResult;
        continue;
      }

      return providerResult;
    }

    return providerResult;
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

async function streamTextForProvider(
  provider: ProviderId,
  input: StreamTextInput & { maxOutputTokens: number; model: string },
): Promise<StreamTextResult> {
  if (provider === "anthropic") {
    return streamAnthropicText(input);
  }

  if (provider === "openai") {
    return streamOpenAiText(input);
  }

  return {
    ok: false,
    error: toConfigurationError({
      message: `No streaming adapter registered for provider ${provider}.`,
      provider,
    }),
  };
}

async function streamAnthropicText(
  input: StreamTextInput & { maxOutputTokens: number; model: string },
): Promise<StreamTextResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: toConfigurationError({
        message: "ANTHROPIC_API_KEY is not configured.",
        provider: "anthropic",
      }),
    };
  }

  try {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const stream = client.messages.stream({
      max_tokens: input.maxOutputTokens,
      messages: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })) satisfies MessageParam[],
      model: input.model,
      system: input.system ?? undefined,
      temperature: input.temperature ?? undefined,
    });

    stream.on("text", (delta) => {
      void input.onDelta?.(delta);
    });

    const message = await stream.finalMessage();
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");

    return {
      ok: true,
      data: text,
      model: input.model,
      provider: "anthropic",
      usage: {
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
      error: toModelError({ error, provider: "anthropic" }),
    };
  }
}

async function streamOpenAiText(
  input: StreamTextInput & { maxOutputTokens: number; model: string },
): Promise<StreamTextResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      error: toConfigurationError({
        message: "OPENAI_API_KEY is not configured.",
        provider: "openai",
      }),
    };
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const stream = client.responses.stream({
      input: [
        ...(input.system
          ? [{ role: "system" as const, content: input.system }]
          : []),
        ...input.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
      max_output_tokens: input.maxOutputTokens,
      model: input.model,
      temperature: input.temperature ?? undefined,
    });

    stream.on("response.output_text.delta", (event) => {
      void input.onDelta?.(event.delta);
    });

    const response = await stream.finalResponse();
    const usage = response.usage;

    return {
      ok: true,
      data: response.output_text,
      model: input.model,
      provider: "openai",
      usage: {
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
      } satisfies Usage,
    };
  } catch (error) {
    return {
      ok: false,
      error: toModelError({ error, provider: "openai" }),
    };
  }
}
