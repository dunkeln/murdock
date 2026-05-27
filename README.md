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

## Claude MCP Connector

Murdock exposes a contained MCP v1 tool surface at `/api/mcp/v1`. Run the app
first, then point Claude Desktop at the stdio bridge:

```bash
npm run dev
```

```json
{
  "mcpServers": {
    "murdock": {
      "command": "node",
      "args": ["/Users/prateek/code/murdock/scripts/murdock-mcp-stdio.mjs"],
      "env": {
        "MURDOCK_MCP_HTTP_URL": "http://localhost:3000/api/mcp/v1"
      }
    }
  }
}
```

If `MURDOCK_MCP_API_TOKEN` is set on the Next.js server, set the same value in
the Claude connector `env`. The bridge writes only MCP JSON-RPC messages to
stdout and structured process logs to stderr.

For broad case-review questions, the MCP exposes `get_case_review_digest` as the
first-call tool. It returns group counts, omitted counts, priorities, and sample
titles only. Use `get_case_review_group` to drill into one group, and use
narrower provenance tools only after that. For next-step planning, use
`get_roi_review_plan` to propose bounded review choices and
`preview_review_transition_plan` to inspect status changes without writing them.

MCP outputs use MCP-scoped opaque refs such as `action_...`, `issue_...`,
`doc_...`, and `span_...`. Internal database UUIDs, reducer refs, raw refs, OCR
conversion IDs, document hashes, and source span IDs should not leave the server
boundary.

## Review Work Items

Human review work flows through one internal spine: `ReviewWorkItem`.
Reducer rows, workspace issue fallbacks, matter operations, MCP review actions,
ROI plans, operational signals, and UI control cards should project from
that shape instead of redefining action fields. MCP remains a boundary
projection with opaque refs; it is not a second review-action domain model.

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
