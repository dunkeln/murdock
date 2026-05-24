# Murdock Guide

Murdock is a Next.js 16 legal workflow workspace. The project should stay container-friendly, typed at module boundaries, and ready for cloud deployment.

## Local Development

Use npm so `package-lock.json` remains authoritative:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Required environment variables for server-backed features:

```bash
NEON_CONN_URL=
MISTRAL_API_KEY=
```

Do not print secrets in logs or client components.

## Architecture

- `app/` contains Next.js routes and server actions.
- `components/` contains app UI and shadcn/ui primitives.
- `lib/contracts/` contains Zod schemas and DTO types shared across UI, server services, repositories, and adapters.
- `lib/server/` contains server-only code. Keep SDKs, secrets, database clients, and provider calls out of client components.
- `lib/server/adapters/` contains stateless external API adapters grouped by provider.
- `lib/server/workflows/` contains provider-independent legal workflow orchestration and validation.
- `db/migrations/` contains incremental Postgres migrations for Neon.

## Canonical Workflow Shape

Every legal workflow should normalize into the same structure:

1. Case or matter context.
2. Source document references.
3. OCR conversion references.
4. Extracted facts with citations and confidence.
5. Tasks with ownership, due dates, and blockers.
6. Review decisions for human or automated gates.

Workflow-specific logic can add detail fields and metadata, but it should not leak raw provider responses upstream.

## OCR Ingestion

The current document ingestion path is intentionally linear:

1. A dropped file is sent from the app shell to a Server Action.
2. The Server Action validates file presence and the 10 MB upload limit.
3. The OCR service computes a SHA-256 digest and checks `ocr_conversions`.
4. A fresh ready conversion is reused until its expiry.
5. A new, pending, or expired conversion is processed through the Mistral adapter and written back to Neon.

The UI only receives conversion status, expiry, page count, and the conversion ID. It does not receive raw provider responses or OCR markdown through this path.

Successful OCR conversions use the default two-day cache window. Failed attempts use a short five-second expiry so credential fixes or transient provider recovery can be retried without keeping stale failures in the client-facing path.

When multiple files are dropped together, the client starts up to three OCR uploads concurrently. This avoids a slow one-by-one user experience without adding queue scaffolding. Server-side idempotency still prevents duplicate OCR work for the same document hash.

## Verification

Run these before handing off code changes:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

`npm test` currently fails until a test script is added. Keep reporting that explicitly.

## Deployment Notes

The app should remain cloud-deployable:

- Keep runtime configuration in environment variables.
- Keep long-running or retryable work out of request/response paths.
- Prefer durable jobs for OCR and document processing.
- Scope data by user or firm before exposing it to UI routes.
- Return typed objects and structured errors from external API surfaces.
