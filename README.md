# Murdock

Murdock is a provenance-first operational legal workspace. The current product
slice is an OCR-document harness that turns already-OCR'd legal document bundles
into source-grounded findings, conflicts, validation-aware review gates, and
workspace controls.

The model is bounded to extraction and summarization. The app owns schemas,
validation, routing, human gates, workflow state, and audit state.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Core server-backed features use:

```bash
NEON_CONN_URL=
MISTRAL_API_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
```

## Harness V1

The v1 harness starts after OCR:

```text
OCR bundle
-> source map
-> document quality findings
-> tolerant Anthropic draft extraction
-> app compilation into strict findings
-> conflict reconciliation
-> deterministic review gates
-> workspace projection
```

The internal contract is `harness.v1` with five primitives:

- `SourceSpan`
- `FindingDraft`
- `Finding`
- `Conflict`
- `ReviewGate`

The harness uses a tolerant-reader funnel before commitment: model-facing drafts
may carry small extra metadata, but durable findings, conflicts, gates, and
workspace records are strict app-owned outputs.

No external legal research, autonomous escalation, or model-owned workflow
control is in scope for this slice.

## Checks

```bash
npm run audit:lean
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Real OCR plus Anthropic E2E can be run explicitly:

```bash
RUN_HARNESS_E2E=1 npx vitest run tests/harness-e2e.test.ts --testTimeout 240000
```
