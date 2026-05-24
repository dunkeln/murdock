# Server AI Boundary

This folder is the model-agnostic boundary for canonical shaping and future workflow assistance.

Rules:

- Server services call `router.ts`, not provider SDKs.
- Provider SDKs live under `providers/`.
- Provider responses must be parsed into typed Murdock contracts before returning upstream.
- Raw OCR markdown, legal excerpts, file contents, API keys, and provider response bodies must not enter telemetry.
- Provider fallback is allowed for transient provider failures, not for validation failures or missing source data.

Current status:

- `router.ts` selects ordered provider routes from environment configuration.
- `generate-object.ts` is the reusable structured-output entrypoint.
- Anthropic uses native tool use with an `input_schema`.
- OpenAI uses native Responses structured output with the SDK Zod helper.
- No runtime canonical extraction or workflow generation is wired here yet.
- Anthropic and OpenAI remain implementation details below this boundary.

Use this shape from future server services:

```ts
const result = await generateObject({
  preferredProvider: "anthropic",
  schema,
  schemaName: "canonical_extraction",
  system,
  messages,
});
```

The shared entrypoint validates provider output through the source Zod schema
after every call. Retryable provider failures can fall through to the next
configured provider route; validation failures do not fall back silently.
