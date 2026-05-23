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
