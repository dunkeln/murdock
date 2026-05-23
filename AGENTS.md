## AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:ui-rules -->
# UI Rules

Use shadcn/ui and Tailwind CSS for application UI. Do not build greenfield UI systems or write custom CSS when a Tailwind utility or shadcn/ui component pattern can satisfy the need.

Prefer composing and extending existing shadcn/ui components with Tailwind classes. Keep global CSS limited to framework setup, theme tokens, and truly unavoidable cross-cutting styles.
<!-- END:ui-rules -->

<!-- BEGIN:architects-playbook-guardrails -->
# Architect's Playbook Guardrails

These rules are strict project guardrails for Codex work and for any future agent harness, runtime, or LLM-powered workflow built in this repository. Do not bypass them with prompt-only solutions when architectural controls are required.

## Core Stance

- Prefer architecture over prompt wording.
- Prefer typed intermediates over free-form text.
- Prefer deterministic control paths over model discretion.
- Prefer explicit memory systems over raw transcript passing.
- Prefer routing, batching, caching, and pruning over indiscriminate real-time calls.
- Treat the model as one component inside a controlled software system, not as the control plane.

## Constraint Hierarchy

- `Compliance`: enforce with application-layer controls, tool-call intercepts, server-side checks, and explicit escalation paths. Do not rely on "the prompt says not to".
- `Latency`: mitigate through parallelization, caching, queueing, and batch paths when work does not need real-time response.
- `Accuracy`: improve through schema validation, structured intermediate representations, few-shot normalization, redundant checks, and human review routing.
- `Cost`: control through context pruning, batching, routing by SLA, and avoiding unnecessary high-latency or high-cost paths.

## Data and Schema Rules

- Design schemas to survive edge cases. Avoid brittle enums that require constant expansion; use catch-all values plus detail fields when needed.
- Do not overwrite original extracted values when amended or superseding data matters. Store versions with provenance, source, and effective dates.
- For arithmetic or consistency-sensitive extraction, capture both stated values and calculated values, then flag mismatches for review.
- Missing source information must become deterministic `null`, not plausible model invention.
- Normalize formats with examples and validation, not with vague wording.
- Use field-level confidence only with validation by document type, field, and segment. Aggregate confidence is not enough.

## Tool and Runtime Rules

- Tool results should be structured. Tool failures should return structured error payloads such as `isError`, `errorCategory`, and `isRetryable`; do not return empty strings or crash the agent path.
- Filter verbose tool outputs before they enter model context. Keep only fields relevant to the task.
- On resumed sessions, treat old tool results as stale unless explicitly verified. Re-query systems of record when freshness matters.
- If execution order matters, enforce it with API/runtime constraints, not prompt instructions alone.
- Split broad tools into granular, specific tools with clear descriptions, expected outputs, and guidance on when to prefer them over generic search or shell commands.

## Human Review and Escalation

- If a user asks for a human escalation in a workflow that supports it, honor that immediately.
- Before escalation, gather required account, case, or matter context through the proper tools.
- Hand off structured summaries, not raw transcripts. Include root cause, relevant IDs, amounts or deadlines, and recommended action where applicable.
- Route low-confidence, inconsistent, policy-sensitive, or incomplete outputs to review rather than pretending automation succeeded.

## Context, Memory, and Long-Running Work

- For long-running exploration or agent work, maintain a dense scratchpad or memory file with key findings, decisions, architecture maps, and unresolved questions.
- Compress resolved history into summaries and keep active unresolved issues in fuller detail.
- Do not pass full transcripts between agents or stages. Use shared memory or structured artifacts and retrieve only relevant prior findings.
- When resuming after code changes, do targeted re-analysis of changed files/functions. Do not force a full reread, and do not pretend nothing changed.

## Multi-Agent and Delegation Rules

- Use parallelism only for independent units of work with clear ownership and synthesis criteria.
- Delegate goals and evaluation criteria rather than micromanaged search steps when using specialized agents.
- Require claim-to-source mappings for research or synthesis workflows.
- Normalize outputs from heterogeneous agents into structured intermediate representations before synthesis.
- Avoid duplicated context and duplicated work across agents.

## Coding and Exploration Rules

- Start broad, then narrow: read project instructions, README/GUIDE, imports, and base interfaces before deep implementation tracing.
- Avoid linear reading of large files or codebases when targeted search and dependency tracing can answer the question.
- Use scratchpads or project memories for important architectural findings that need to survive context limits.
- Make production behavior explicit: validation, routing, retries, fallbacks, and failure states should be visible in code structure.

## Retry and Failure Rules

- Automated retries are acceptable for formatting mistakes, schema shape mismatches, and recoverable generation errors.
- Do not keep retrying when the source lacks the needed information. Fail fast or route to human review.
- Distinguish transient failures, policy failures, validation failures, and missing-information failures.

## Production Architecture Blueprint

When building agentic or LLM-backed systems, preserve this layered model:

- Edge layer: user interactions, pattern router, real-time path, batch path, and granular tools.
- Core layer: strict typing, schema checks, validation guardrails, aggregation, synthesis, formatting, and delivery.
- Control layer: policy enforcement, tool-call interception, execution controls, and escalation.
- State layer: pruning logic, scratchpads, shared memory, context window management, and source-of-truth refresh.
<!-- END:architects-playbook-guardrails -->
