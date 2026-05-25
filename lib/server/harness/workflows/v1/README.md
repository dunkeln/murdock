# Harness Workflow V1

V1 is an OCR-document harness, not an agent runtime.

Flow:

1. Build a source map from ready OCR output.
2. Emit deterministic document-quality findings.
3. Split source spans by a complexity budget.
4. Ask Anthropic for tolerant `FindingDraft` records only.
5. Compile drafts into strict internal `Finding` records.
6. Reconcile comparable findings into conflicts.
7. Compute review gates in app code.

The internal state is `harness.v1`:

- `SourceSpan`
- `FindingDraft`
- `Finding`
- `Conflict`
- `ReviewGate`

`FindingDraft` is the model/human-facing extraction surface. The app compiles it
into strict findings, then facts, timelines, issue lists, and workspace controls
are projections over that state. The model drafts; the harness validates and
reconciles; the app gates; humans resolve; audit state records decisions.

Intermediate drafts are tolerant readers: unknown, bounded metadata may pass
through `extras`, but it never controls routing or conflict resolution unless a
future app compiler explicitly promotes it.

## Context Resolver Boundary

Footer/runtime callers should not choose between source-ready and full-ready
state. They should call the harness context resolver with a question and
optional filters, then use the returned compact context.

Resolution order is deterministic:

1. Completed `HarnessBundle` -> `full_ready` or `needs_review`.
2. `SourceMap` only -> `source_ready` with excerpts and quality flags.
3. Neither -> `not_ready`.

This keeps the LLM runtime unaware of harness internals. The runtime asks for
case context; the harness decides the best available layer and returns limits,
answerable scope, selected items, and citations.
