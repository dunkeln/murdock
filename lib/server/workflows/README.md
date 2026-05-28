# Server Workflow Layer

Server-side workflow code belongs in this folder.

Rules:

- Workflows consume typed OCR, harness, case, and workspace contracts.
- Model calls stay below `lib/server/ai/`.
- External SDKs stay below `lib/server/adapters/`.
- Persistence lands in repositories.
- UI-facing workflow state must be source-grounded and schema-validated.

The default OCR-to-controls workflow is `harness.v3`. V3 is the MIME-aware
track: source-specific extraction should happen at the edge, then canonical
source records are projected into the same workspace tables. Facts, timelines,
issues, and controls are projections, not separate model-owned engines.

Set `HARNESS_WORKFLOW_VERSION=v1` or `v2` only when intentionally running an
older compatibility path.
