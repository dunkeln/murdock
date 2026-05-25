import "server-only";

import { type Message, type ModelError } from "@/lib/ai";
import type { JsonObjectSchema } from "@/lib/server/ai/schema";

export type ProviderId = "anthropic" | "openai";

export type PromptCacheOptions = {
  enabled: boolean;
  ttl?: "5m" | "1h";
};

export type Usage = {
  cacheCreationEphemeral1hInputTokens?: number | null;
  cacheCreationEphemeral5mInputTokens?: number | null;
  cacheCreationInputTokens?: number | null;
  cacheReadInputTokens?: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ProviderGenerateInput = {
  jsonSchema: JsonObjectSchema;
  maxOutputTokens: number;
  messages: Message[];
  model: string;
  schemaDescription: string;
  schemaName: string;
  promptCache?: PromptCacheOptions | null;
  system: string | null;
  temperature: number | null;
};

export type ProviderGenerateResult =
  | {
      data: unknown;
      model: string;
      ok: true;
      provider: ProviderId;
      usage: Usage;
    }
  | {
      error: ModelError;
      ok: false;
    };

export type Provider = {
  generateObject: (
    input: ProviderGenerateInput,
  ) => Promise<ProviderGenerateResult>;
  id: ProviderId;
};
