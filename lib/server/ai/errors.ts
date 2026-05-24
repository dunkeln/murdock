import "server-only";

import { type ModelError, modelErrorSchema } from "@/lib/ai";

type ProviderErrorInput = {
  error: unknown;
  provider: string | null;
};

export function toModelError(input: ProviderErrorInput): ModelError {
  if (isTimeoutError(input.error)) {
    return modelErrorSchema.parse({
      isError: true,
      errorCategory: "timeout",
      isRetryable: true,
      message: "Model provider request timed out.",
      provider: input.provider,
    });
  }

  const status = getErrorStatus(input.error);

  if (status === 429) {
    return modelErrorSchema.parse({
      isError: true,
      errorCategory: "rate_limit",
      isRetryable: true,
      message: "Model provider rate limit was reached.",
      provider: input.provider,
    });
  }

  if (status && status >= 500) {
    return modelErrorSchema.parse({
      isError: true,
      errorCategory: "provider_unavailable",
      isRetryable: true,
      message: "Model provider is temporarily unavailable.",
      provider: input.provider,
    });
  }

  if (status && status >= 400) {
    return modelErrorSchema.parse({
      isError: true,
      errorCategory: "configuration",
      isRetryable: false,
      message: "Model provider rejected the request configuration.",
      provider: input.provider,
    });
  }

  return modelErrorSchema.parse({
    isError: true,
    errorCategory: "unknown",
    isRetryable: false,
    message:
      input.error instanceof Error
        ? input.error.message
        : "Model provider failed unexpectedly.",
    provider: input.provider,
  });
}

export function toSchemaValidationError(input: {
  message: string;
  provider: string | null;
}): ModelError {
  return modelErrorSchema.parse({
    isError: true,
    errorCategory: "schema_validation",
    isRetryable: false,
    message: input.message,
    provider: input.provider,
  });
}

export function toConfigurationError(input: {
  message: string;
  provider: string | null;
}): ModelError {
  return modelErrorSchema.parse({
    isError: true,
    errorCategory: "configuration",
    isRetryable: false,
    message: input.message,
    provider: input.provider,
  });
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const errorRecord = error as { status?: unknown; statusCode?: unknown };
  const status = errorRecord.status ?? errorRecord.statusCode;

  return typeof status === "number" ? status : null;
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return error.name === "AbortError" || message.includes("timeout");
}
