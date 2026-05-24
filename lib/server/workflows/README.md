# Server Workflow Layer

Server-side workflow code belongs in this folder.

Keep the boundary narrow:

- `canonical.ts` owns provider-independent workflow validation and summaries.
- Workflow-specific modules should transform source documents, OCR conversions, and case context into `lib/contracts/legal-workflows.ts` DTOs.
- Provider calls stay in `lib/server/adapters/*`; workflow modules consume typed adapter results only.
- Persistence should land in repositories when a workflow surface becomes real in the UI.

The canonical model is intentionally not tied to bankruptcy, immigration, or general matters. Workflow-specific fields should use typed facts, document purposes, citations, tasks, and review decisions rather than adding one-off top-level DTO fields.
