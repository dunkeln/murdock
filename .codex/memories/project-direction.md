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
