# Project Direction

This project is being built as an assessment submission for Glade's Forward Deployed Engineer role.

Glade builds AI-powered software for law firms. The assessment should show that the builder understands real legal workflows: filings, case management, document generation, attorney/paralegal handoffs, deadline pressure, and messy client environments.

Success means the project feels useful to Glade, Glade's law-firm customers, or the clients served through those firms. A small, thoughtful feature is better than a large generic demo.

The submission should prove:

- Product judgment: explain why this legal workflow matters, what was intentionally scoped out, and which user pain it reduces.
- Engineering taste: clean structure, typed boundaries, clear state management, sensible data modeling, realistic edge cases, and a path to evolve into a production feature.
- Intentional design: UI should feel considered and domain-specific, not like a default generated demo.
- AI usefulness: use AI only where it clearly reduces manual legal work, improves review quality, or speeds up a workflow. Avoid AI for its own sake.
- Forward-deployed mindset: prioritize deployability, diagnostics, client workflow fit, fast issue resolution, and ownership from discovery through production rollout.
- Communication: make the app and docs understandable to both engineers and legal operators such as attorneys and paralegals.
- Packaging: the project must be accessible outside a coding artifact. It should be repo-ready, hostable, containerizable, and easy to run.

Build toward a production-facing Next.js application. Prefer deterministic, reproducible, explicit implementations over clever abstractions. Keep contracts typed and avoid leaking raw external API responses through the app.

Safety and compliance direction: preserve a path to secure containerized deployments, HIPAA readiness when matters include PHI or covered-entity/business-associate workflows, SOC 2 readiness, BAA availability for vendors that may process PHI, and zero data retention or equivalent no-training/no-retention modes for AI and document-processing providers. Do not claim HIPAA compliance, SOC 2 compliance, or BAA coverage unless the contracts, controls, scope, and audits are actually in place.

Maintain documentation as the project matures. Keep `README.md` current and add or update `GUIDE.md` alongside it for non-marimo work. Documentation should clearly describe the problem, target users, tradeoffs, setup, test commands, deployment path, and future evolution.

This is a Next.js 16 project. Before making framework-level changes, read the relevant local docs in `node_modules/next/dist/docs/` and treat them as authoritative.

## Murdock Product Stance

Murdock is a provenance-first operational legal workspace, not a chatbot-first legal AI product. The system should reduce cognitive fragmentation across evolving case materials while preserving trust, chronology, source context, and lawyer control.

Original documents and OCR outputs remain the source of truth. Harness records are operational semantic overlays used for retrieval, workflow readiness, contradiction surfacing, revision drift, review gates, and provenance expansion. They must not replace or silently rewrite the source material.

Current UX direction is a calm dark legal workspace with a case rail, compact controls, uppercase operational headings, progressive disclosure, and visible provenance expansion. The system should first orient the lawyer around current state, risk, and next action before exposing deeper metadata.

## Workflow V1 Direction

The V1 workflow is:

```text
OCR
-> source map
-> deterministic document-quality findings
-> segment splitter
-> Anthropic tolerant FindingDraft extraction
-> app compilation into strict Finding records
-> deterministic conflict reconciliation
-> app-computed ReviewGate routing
-> deterministic workspace projection
```

The source map before the model is not semantic canonicalization. It exists to preserve document/page/span identity, exact source excerpts, OCR text, and stable provenance anchors before any model reasoning happens.

Anthropic is the only provider used by Workflow V1 normalization. The provider-neutral adapter can continue to exist for future routing, but this path should not silently fall back to OpenAI. Missing keys, provider errors, and validation failures must become structured visible failures.

The LLM should emit tolerant `FindingDraft` candidates, not the full persisted app state. Deterministic code maps flexible model dialects into the strict `Finding` contract and preserves missing/unsupported status instead of inventing values.

The workspace control surface should not call a second model to reshape the same material. It should deterministically project validated `harness.v1` bundles into facts, operational issues, control actions, and visible review states.

AG-UI is an internal typed event/action transport for this slice, not an SSE runtime, client agent runtime, or chatbot shell. It should reveal controls progressively from durable workflow/workspace state.

## Harness Contract Direction

Versioning matters for both harness contracts and workflows. The current internal contract is `harness.v1`, and workflows live under versioned paths such as `workflows/v1`.

Progress on May 27, 2026: `harness.v3` is now the default workflow identity. The selector returns v3 when `HARNESS_WORKFLOW_VERSION` is unset or explicitly set to `v3`; `v1` and `v2` are now compatibility modes that must be requested through `HARNESS_WORKFLOW_VERSION=v1` or `HARNESS_WORKFLOW_VERSION=v2`.

V3 is the MIME-aware harness track. The product direction is:

```text
uploaded source
-> MIME/type router
-> source-specific extractor
-> canonical source records
-> findings / conflicts / chronology / review gates
-> workspace projection
-> reducer and action queue
```

Current implementation note: v3 currently routes through the annotation-backed compiler path for compatibility while MIME-specific extractors are built out. Do not treat this as a finished MIME compiler. Treat it as the default versioned track that future PDF, DOCX, HTML/email, spreadsheet, image, text, and markdown extractors should plug into.

The V1 contract is compressed around five primitives: `SourceSpan`, `FindingDraft`, `Finding`, `Conflict`, and `ReviewGate`. `FindingDraft` is the intuitive model/human-facing surface; `Finding` remains the strict internal operational record. Facts, timelines, issue lists, and control panels are projections over those primitives, not separate model-owned engines.

Use a tolerant-reader funnel before commitment: provider-facing drafts may carry bounded `extras` for metadata such as section, form line, table cell, artifact reference, calculation, or currency, but source spans and final findings/conflicts/gates stay strict. Unknown draft metadata is pass-through context only unless app code explicitly promotes it later.

Workflows should be composable through declarative steps: source map, quality checks, segmentation, extraction, reconciliation, and gate computation. Revising rollout behavior should mean swapping or composing steps, not rewriting the whole harness.

The harness contract should preserve source spans, citations, nulls, stated/original values, normalized values, conflict candidates, and review gates. Missing source information must remain deterministic `null`, `missing`, `unclear`, or `unsupported`, not plausible model completion.

OCR confidence should preserve provider-native 0-100 scale in harness source spans. Do not collapse it into a generic 0-1 model confidence field unless a separate explicitly normalized field is introduced.

Batching should be based on complexity budgets, not page count alone. Page count, character count, table cell count, numeric mention count, and artifact pressure are all relevant. Cached OCR may currently collapse page structure when only markdown is stored; this is accepted temporarily until OCR page persistence improves.

## Lean Maintenance

Use `npm run audit:lean` as the default artifact-code audit. It runs Knip against unused files, dependencies, unlisted dependencies, unresolved imports, and binaries with gitignored tests included. Do not use full export-only Knip output as an automatic blocker because Zod schemas and harness step exports can be intentional public boundaries.

Stale canonical-era workflow artifacts should be removed rather than kept as dormant abstractions. The active direction is harness/funnel extraction, deterministic projection, and strict final records.

## Footer Runtime Direction

The footer input runtime should not receive the full harness bundle by default. Treat the harness as the case intelligence store and resolve context through narrow, typed retrieval tools instead of stuffing broad JSON into the prompt.

The preferred runtime shape is:

```text
User question
-> footer runtime
-> harness retrieval tools
-> compact source-grounded context
-> answer with citations, limits, and uncertainty
```

Useful future tool boundaries include `getReadiness`, `searchFindings`, `getFinding`, `listIssues`, `listConflicts`, `searchSourceSpans`, and `getSourceSpan`. The model may plan retrieval and compose answers, but the app remains responsible for source truth, schema validation, review gates, conflict status, readiness state, persistence, and final legal workflow decisions.

This supports the funnel strategy: wide OCR/source data stays in durable harness state, while the LLM pulls only the relevant slices needed for the current question. It also keeps token budget lower and prevents the footer runtime from becoming the workflow control plane.

## Operational Signal Ledger Direction

The next primitive should be an operational signal ledger, not a canonical matter status machine.

Do not introduce universal legal workflow states such as `intake`, `pending_signature`, `ready_to_file`, `filed`, `awaiting_response`, or `pending_hearing` as durable case status. Those labels encode assumptions about legal operator workflow and will not generalize cleanly across immigration, bankruptcy, criminal, family, corporate, litigation, and other practice areas.

Instead, store structured temporal observations that describe what changed, what remains active, what was superseded, and what evidence supports each observation. Runtime agents may synthesize a freeform matter posture from those signals in a response, but v1 should not persist that synthesized posture as source-of-truth state.

The preferred primitive is a case-scoped signal record with:

- `signalType`: document added, document changed, review action opened/resolved/dismissed, deadline/date detected, party/value changed, conflict detected, user note, external event, or similar observation-level categories.
- `title` and `summary`: compact human-readable operational wording.
- `observedAt` and optional `occurredAt`: separate system observation time from real-world event time.
- `sourceRefs` / `rawRefs`: source spans, documents, revision claims, review actions, and user events that support the signal.
- `importance`: low, medium, high, or blocking.
- `state`: active, superseded, resolved, or informational.
- `generatedBy`: deterministic rule, harness/reducer, human, or external connector.

Azimuth decision on May 25, 2026: **PILOT FIRST**. Implement a narrow v1 ledger and MCP read surface only. Derive signals from existing `case_source_documents`, `document_revision_claims`, `case_review_actions`, and `case_review_action_events`. Do not add court calendars, external connectors, filing receipts, practice-area profiles, or persisted runtime posture in v1.

The pilot must answer these questions without raw table access:

- What changed in this matter?
- What is still active?
- What was superseded?
- What source supports this signal?
- What human action changed the operational picture?

If the signal ledger cannot answer those cleanly, runtime synthesis will compound ambiguity. Keep the durable layer structured and evidence-backed; keep posture synthesis freeform and runtime-scoped until the signal substrate proves useful.

## Review Action Ontology Direction

Decision on May 26, 2026: do not hard-code a broad legal-task ontology into reducer review actions or action events. Murdock should capture procedural signals and human dispositions without forcing legal workers to describe their work through a premature taxonomy.

The reducer may suggest action options for UX clarity, but it must not resolve legal meaning or convert review notes into rigid practice-area workflow states. Human actionability is captured through an event stream, and the current state of a review action is derived from those events.

Use a small control-surface enum plus open detail fields:

```ts
event_kind:
  | "note"
  | "decision"
  | "handoff"
  | "task"
  | "state_change"
  | "system"
  | "other"

event_code: string | null
note: string | null
payload: jsonb
```

Do not store redundant vague fields such as both `event_detail` and `label`. Prefer `event_code` as the stable machine-readable semantic and derive UI labels from it. If the exact text shown to the user must be preserved for audit, store it explicitly as `display_label_snapshot`, not as a generic label that can drift from the event code.

This follows the Architect's Playbook pattern of a resilient catch-all enum plus detail field: the enum is for system control, filtering, and MCP/tool behavior; `event_code`, `note`, and `payload` preserve the legal worker's actual operational meaning.

The durable rule is: evidence and recommendations are system-owned; disposition and legal-ops actionability are human-owned. Reducer output creates review action candidates. Human events decide whether something was resolved, deferred, escalated, dismissed, converted to a task, commented on, or reopened.

## Case Workspace UX Direction

The case workspace should feel like an evolving legal matter, not a collection of AI tools. The lawyer or legal operator should see source material, quiet attention cues, and a ready/not-ready footer affordance, not harness telemetry, AG-UI event language, orchestration labels, or dashboard KPI behavior.

Use a simple UI-facing DTO between the rich harness/workspace records and React. The current boundary is `CaseControlDto`: readiness, a primary attention item, a short queue, simple source refs, footer readiness, and basic case identity. The UI should consume this projection rather than receiving raw findings, conflicts, gates, source spans, AG-UI events, and harness stats separately.

Quiet attention guidance is now the product rule. Importance should be communicated through spacing, grouping, hierarchy, order, progressive disclosure, and whether the footer send button is enabled. Avoid warning banners, excessive badges, redundant labels, heavy instructional text, and visible system orchestration. The interface should make the next thing feel naturally worth attention without telling the user they are being managed by software.

Provenance remains essential but should be soft-revealed. Show enough context to earn trust, then keep source excerpts behind a small collapsed "Source" disclosure unless the lawyer asks to inspect. Trust first, inspect second.

The document/source surface remains primary. During uploads or shaping, the source should remain readable while matter context quietly prepares. Use matter/source language such as "Reading", "Adding source to matter", or "Matter context updated"; avoid "OCR", "workspace controls", "AI controls", and other implementation language in normal UX copy.

Wide-screen layout must be based on actual CSS viewport and available app space, not physical monitor size. The current case route uses conditional layout behavior: without a file rail, side-by-side source/attention can start earlier; with the uploaded file rail present, side-by-side waits until a wider breakpoint so the PDF is not squeezed. The route also constrains the workspace width to avoid sprawling across very large monitors.

Decision on May 27, 2026: keep the primary Action Items decision surface as issue cards with recommended choices, not a data table. The legal operator's first job is to decide the next move on a few high-ROI items, so cards reduce cognitive load by preserving one issue, its summary, and its choices in a single local context. Use a compact "Task queue" snapshot for reconciled or deferred work, modeled like a sticky progress memory that can be retrieved by MCP and passed across agents.

TanStack Table remains a good future fit for a secondary queue-management surface once the product needs sort, filter, row selection, bulk reconciliation, assignment, due dates, or large task volumes. It should not replace the current Action Items cards because the table mental model optimizes operations over many rows, while the current surface optimizes legal judgment over a small set of agent-recommended choices.

## Failure Memory

Do not let backend/database implementation details leak into the case workspace UI. On May 25, 2026, a schema/persistence change caused `/case/rivera-intake` to render "Workspace tables are not available. Run database migrations." inside the carefully tuned empty workspace surface. That was a UX regression and a boundary failure: frontend surfaces should receive a UI-safe workspace contract from the backend, not reflect raw database availability or migration state. If workspace projection tables are unavailable, the backend should degrade to an empty case workspace or a controlled operational state while logging/observing the infrastructure issue server-side.

Do not change stable case workspace UX while working on persistence unless the user explicitly asks for a UI change. Persistence work should preserve the known-good layout, footer behavior, empty states, document switcher behavior, and source/PDF geometry.
