# Server AI Boundary

This folder is the provider-neutral boundary for structured model calls.

Rules:

- Server services call `generate-object.ts`, not provider SDKs.
- Provider SDKs live under `providers/`.
- Provider output must parse through the caller's Zod schema.
- Raw OCR markdown, legal excerpts, file contents, API keys, and provider
  response bodies must not enter telemetry.
- Provider fallback is allowed for transient provider failures, not for
  validation failures or missing source data.

The OCR-document harness currently uses Anthropic only for bounded finding
extraction. OpenAI remains available in the adapter layer for future routes.

Example:

```ts
const result = await generateObject({
  allowFallback: false,
  preferredProvider: "anthropic",
  schema,
  schemaName: "murdock_harness_v1",
  system,
  messages,
});
```
