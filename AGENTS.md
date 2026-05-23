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
