import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

const LANGFUSE_KEYS = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"] as const;
const globalTelemetry = globalThis as typeof globalThis & {
  __murdockLangfuseSdk?: NodeSDK;
};

function hasLangfuseCredentials() {
  return LANGFUSE_KEYS.every((key) => Boolean(process.env[key]));
}

if (!globalTelemetry.__murdockLangfuseSdk && hasLangfuseCredentials()) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "murdock",
    spanProcessors: [
      new LangfuseSpanProcessor({
        exportMode:
          process.env.LANGFUSE_EXPORT_MODE === "batched"
            ? "batched"
            : "immediate",
        mask: ({ data }) => maskTelemetryPayload(data),
      }),
    ],
  });

  sdk.start();
  globalTelemetry.__murdockLangfuseSdk = sdk;
}

function maskTelemetryPayload(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(maskTelemetryPayload);
  }

  if (!data || typeof data !== "object") {
    return data;
  }

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (shouldMaskKey(key)) {
        return [key, "[redacted]"];
      }

      return [key, maskTelemetryPayload(value)];
    })
  );
}

function shouldMaskKey(key: string) {
  const normalizedKey = key.toLowerCase();

  return (
    normalizedKey.includes("secret") ||
    normalizedKey.includes("token") ||
    normalizedKey.includes("key") ||
    normalizedKey.includes("password") ||
    normalizedKey.includes("content") ||
    normalizedKey.includes("markdown") ||
    normalizedKey.includes("excerpt")
  );
}
