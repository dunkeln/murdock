# Server Workflow Layer

Server-side workflow code belongs in this folder.

Rules:

- Workflows consume typed OCR, harness, case, and workspace contracts.
- Model calls stay below `lib/server/ai/`.
- External SDKs stay below `lib/server/adapters/`.
- Persistence lands in repositories.
- UI-facing workflow state must be source-grounded and schema-validated.

The active OCR-to-controls workflow projects `harness.v1` bundles into existing
case workspace tables. Facts, timelines, issues, and controls are projections,
not separate model-owned engines.
