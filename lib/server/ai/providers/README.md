# AI Providers

Provider adapters belong here.

Each adapter should:

- Be stateless.
- Accept provider-neutral input.
- Return typed objects or structured errors.
- Avoid leaking raw provider responses upstream.
- Keep provider-specific model names, request options, retries, and SDK details local to the adapter.
- Extract only the candidate structured object, then let `generate-object.ts` perform the final shared Zod validation.

Do not import these adapters directly from React components, route pages, or workflow UI files. Use `lib/server/ai/router.ts` or a typed service above it.
