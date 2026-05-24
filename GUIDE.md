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

Optional Langfuse tracing environment variables:

```bash
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_TRACING_ENVIRONMENT=development
LANGFUSE_RELEASE=
OTEL_SERVICE_NAME=murdock
```

If the Langfuse keys are absent, the application skips Langfuse export and continues to run normally. Use `LANGFUSE_EXPORT_MODE=batched` for long-running Node processes; the default local/serverless-friendly mode is immediate export.

Optional model routing environment variables:

```bash
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
OPENAI_API_KEY=
OPENAI_MODEL=
```

Model keys are used behind `lib/server/ai/`. Canonical shaping and workflow code should call the shared AI boundary instead of importing provider SDKs directly.

Do not print secrets in logs or client components.

## Architecture

- `app/` contains Next.js routes and server actions.
- `components/` contains app UI and shadcn/ui primitives.
- `lib/contracts/` contains Zod schemas and DTO types shared across UI, server services, repositories, and adapters.
- `lib/server/` contains server-only code. Keep SDKs, secrets, database clients, and provider calls out of client components.
- `lib/server/adapters/` contains stateless external API adapters grouped by provider.
- `lib/server/ai/` contains model routing and provider-neutral AI boundaries. Provider SDK calls belong below this folder and must return typed results through `generateObject`.
- `lib/server/case-workspace/` contains deterministic, provenance-first case workspace loading for chronology, facts, source spans, and surfaced operational issues.
- `lib/server/telemetry/` contains Langfuse/OpenTelemetry setup and small tracing helpers. Telemetry payloads should use IDs, counts, statuses, and structured error categories instead of raw legal text, OCR markdown, or provider secrets.
- `lib/server/workflows/` contains provider-independent legal workflow orchestration and validation.
- `db/migrations/` contains incremental Postgres migrations for Neon.

## Naming And File Conventions

Use folder context to keep names short. Avoid repeating the bounded context in every symbol when the file path already provides it.

Preferred contract files:

```txt
lib/contracts/
  workspace.ts
  workflow.ts
  provenance.ts
  ocr.ts
  cases.ts
```

Preferred backend folders for new work:

```txt
lib/server/workspace/
  repo.ts
  service.ts
  analyze.ts
  errors.ts
  map.ts

lib/server/ai/
  router.ts
  providers/
```

Preferred frontend folders for new workspace UI:

```txt
components/app/workspace/
  workspace-view.tsx
  header.tsx
  heartbeat.tsx
  attention-list.tsx
  chronology.tsx
  provenance.tsx
  facts.tsx
  empty-state.tsx
```

Inside a bounded file, prefer short nouns:

```ts
sourceDocSchema
spanSchema
factSchema
eventSchema
issueSchema
workspaceSchema
```

Across import boundaries, alias only when clarity requires it:

```ts
import type { Event as WorkspaceEvent } from "@/lib/contracts/workspace";
```

Existing longer names such as `caseWorkspaceSourceDocumentDtoSchema` are tolerated until nearby work makes a rename worthwhile. Do not run a repo-wide rename unless the new names are already stable.

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

## Case Workspace

The case workspace is a read-only operational semantic layer over case material. It should preserve exact source excerpts and source identifiers so lawyers can inspect the original context before relying on a surfaced fact, chronology event, contradiction, or revision drift issue.

The first implementation is deterministic and schema-backed. It does not call an LLM provider. Future model-backed extraction should enter through a typed adapter boundary and must return schema-validated facts, chronology events, issues, and source spans before anything reaches the UI.

## Verification

Run these before handing off code changes:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

`npm test` runs Vitest unit coverage for case workspace contracts, row mapping, deterministic issue grouping, empty states, and structured service errors.

## Deployment Notes

The app should remain cloud-deployable:

- Keep runtime configuration in environment variables.
- Keep long-running or retryable work out of request/response paths.
- Prefer durable jobs for OCR and document processing.
- Scope data by user or firm before exposing it to UI routes.
- Return typed objects and structured errors from external API surfaces.
