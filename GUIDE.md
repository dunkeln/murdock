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

Model keys are used behind `lib/server/ai/`. Harness extraction and workflow code should call the shared AI boundary instead of importing provider SDKs directly.

Do not print secrets in logs or client components.

## Architecture

- `app/` contains Next.js routes and server actions.
- `components/` contains app UI and shadcn/ui primitives.
- `lib/contracts/` contains Zod schemas and DTO types shared across UI, server services, repositories, and adapters.
- `lib/server/` contains server-only code. Keep SDKs, secrets, database clients, and provider calls out of client components.
- `lib/server/adapters/` contains stateless external API adapters grouped by provider.
- `lib/server/ai/` contains model routing and provider-neutral AI boundaries. Provider SDK calls belong below this folder and must return typed results through `generateObject`.
- `lib/agui.ts` and `lib/server/agui/` contain the internal AG-UI control event boundary. AG-UI is used as a typed event transport for workspace controls, not as a chatbot runtime.
- `lib/server/case-workspace/` contains deterministic, provenance-first case workspace loading for chronology, facts, source spans, and surfaced operational issues.
- `lib/server/telemetry/` contains Langfuse/OpenTelemetry setup and small tracing helpers. Telemetry payloads should use IDs, counts, statuses, and structured error categories instead of raw legal text, OCR markdown, or provider secrets.
- `lib/server/workflows/` contains provider-independent legal workflow orchestration and validation.
- `db/migrations/` contains incremental Postgres migrations for Neon.

## Cognitive Load Controls

Keep new work inside one of these layers. If a feature does not fit, update this
guide before adding code.

| Layer | Owns | Must not own |
| --- | --- | --- |
| `components/app/` | Rendering typed state, local interaction state, shadcn/Tailwind composition | Legal workflow decisions, provider calls, source reconciliation |
| `app/(app)/actions.ts` and route actions | Validating form inputs, calling services, revalidating routes, returning typed action results | Database SQL, provider SDK calls, model prompts |
| `lib/contracts/` | Zod schemas, DTOs, stable cross-layer types | Runtime orchestration or UI formatting |
| `lib/server/adapters/` | Stateless external API calls with typed returns | Business decisions or persistence |
| `lib/server/*/repository.ts` | SQL and storage mapping | Validation policy, model calls, UI DTO assembly beyond row mapping |
| `lib/server/*/service.ts` | Use-case orchestration and structured errors | JSX, raw request objects, external SDK details |
| `lib/server/harness/` | OCR-to-harness state: spans, drafts, findings, conflicts, gates | Workspace-specific UI layout |
| `lib/server/workflows/shape/` | Projection from harness state into workspace tables | A second extraction engine |

Default feature rule:

1. Define or reuse a contract first.
2. Put external communication behind an adapter.
3. Put persistence in a repository.
4. Put use-case flow in a service.
5. Let server actions bridge UI events to services.
6. Let components project typed state only.

Avoid these cognitive-load traps:

- Do not create a second facts, timeline, issue, or review-gate engine in UI.
- Do not pass OCR markdown, raw provider responses, or transcript blobs into
  client components.
- Do not introduce broad barrel exports unless a boundary is intentionally
  stable; direct bounded-context imports are easier to audit right now.
- Do not add new provider fallbacks inside harness paths unless the routing and
  validation behavior is made explicit in `lib/server/ai/`.
- Do not solve architectural constraints with prompt wording alone. Use schemas,
  typed intermediates, validation, retries, and review gates.

## Naming And File Conventions

Use folder context to keep names short. Avoid repeating the bounded context in every symbol when the file path already provides it.

Current contract files:

```txt
lib/contracts/
  cases.ts
  case-workspace.ts
  document-ingestion.ts
  harness.ts
  ocr-conversions.ts
```

Preferred backend folders for new work:

```txt
lib/server/<bounded-context>/
  repository.ts
  service.ts
  errors.ts
  mappers.ts

lib/server/ai/
  router.ts
  providers/
```

Preferred frontend folders for new workspace UI:

```txt
components/app/case-workspace/
  case-workspace-view.tsx
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
sourceDocSchema;
spanSchema;
factSchema;
eventSchema;
issueSchema;
workspaceSchema;
```

Across import boundaries, alias only when clarity requires it:

```ts
import type { Event as WorkspaceEvent } from "@/lib/contracts/workspace";
```

Existing longer names such as `caseWorkspaceSourceDocumentDtoSchema` are tolerated until nearby work makes a rename worthwhile. Do not run a repo-wide rename unless the new names are already stable.

## Harness Workflow Shape

Murdock is an OCR-document harness, not an agent runtime or legal research
system. Every legal workflow should normalize into one source-grounded state:

1. OCR bundle intake.
2. Source map construction.
3. Deterministic document-quality findings.
4. Tolerant model extraction into simple `FindingDraft` records.
5. App compilation into strict `Finding` records.
6. Deterministic reconciliation into conflicts.
7. App-computed review gates.
8. Human resolution and audit state.

Workflow-specific screens should project from this state instead of inventing
separate fact, timeline, issue, and review packet engines.

## Workspace Control Surface

The first control-surface workflow is OCR-to-controls:

1. A file drop runs the existing OCR path.
2. Ready or cached OCR conversion IDs run through the v1 harness.
3. Anthropic extracts simple drafts only, with no fallback provider in this path.
4. The harness compiles drafts, validates source support, and reconciles conflicts.
5. Review gates are computed by app code, not model discretion.
6. Workspace shaping projects the harness bundle into the existing workspace tables.
7. The UI receives AG-UI-compatible status and control events, never raw OCR markdown or provider output.

## Harness V1

`lib/server/harness/workflows/v1/` starts after OCR. The v1 contract is
`harness.v1` and is built from five primitives:

- `SourceSpan`
- `FindingDraft`
- `Finding`
- `Conflict`
- `ReviewGate`

The v1 steps are declarative and composable: source map, quality checks,
segmentation, draft extraction, draft compilation, reconciliation, and gate
computation. The model only extracts drafts. The harness preserves conflicts.
The app owns gates.

Draft extraction follows a tolerant-reader funnel. Unknown draft metadata can
pass through in bounded `extras` during extraction, but strict source spans,
findings, conflicts, gates, and workspace records remain the commitment layer.

`ocrConfidence` in harness source spans preserves the provider-native 0-100 OCR
scale. Do not squeeze it into a generic 0-1 model confidence field; if a
normalized OCR score is needed later, use a distinct field name.

Default segment budget:

- 5 pages
- 12k characters
- 150 table cells
- 120 numeric mentions
- 80 source spans

The extractor prompt lives in `prompts/harness-v1.md`.

## Lean Audit

Use Knip for artifact cleanup:

```bash
npm run audit:lean
```

The lean audit checks unused files, dependencies, unlisted dependencies,
unresolved imports, and binaries. It intentionally does not fail on every unused
export because many Zod contracts are explicit module boundaries. Treat
export-only findings as a focused review pass, not a default blocker.

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
