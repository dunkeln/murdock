import "server-only";

import { z } from "zod";

import {
  murdockMcpInputSchemas,
  type MurdockMcpToolDescriptor,
  type MurdockMcpToolName,
} from "@/lib/contracts/mcp";

const toolMetadata = {
  get_case_context: {
    description:
      "Return a bounded case workspace slice with documents, facts, chronology, issues, review actions, or source spans. Use for explicit section requests; prefer get_case_review_digest for broad questions about what needs attention.",
    title: "Get case context",
  },
  get_case_review_digest: {
    description:
      "Return a summary-only digest of open review work grouped for broad case-status questions. This is the first-call tool: it returns counts, group keys, omitted counts, and sample titles without full action summaries.",
    title: "Get case review digest",
  },
  get_case_review_group: {
    description:
      "Return detailed review items for one digest group after get_case_review_digest identifies the group to inspect. Use this for iterative drill-down instead of asking for all open review actions.",
    title: "Get case review group",
  },
  get_document_updates: {
    description:
      "Return document revision summaries for a case, optionally scoped to one source document.",
    title: "Get document updates",
  },
  get_matter_snapshot: {
    description:
      "Return the current operational matter state projected from review actions and document updates. Use this for broad questions about what is still active, blocked, resolved, ignored, untracked, or superseded.",
    title: "Get matter snapshot",
  },
  get_open_review_actions: {
    description:
      "Return unresolved reduced review actions, optionally with their source spans for provenance. Use for follow-up detail; prefer get_case_review_digest for broad review summaries.",
    title: "Get open review actions",
  },
  get_operational_signals: {
    description:
      "Return a deterministic temporal signal projection from documents, document updates, and reduced review actions. Use this to understand what operationally changed without relying on workflow status labels.",
    title: "Get operational signals",
  },
  get_roi_review_plan: {
    description:
      "Return two or three bounded high-ROI review plan choices over open review items. Use after digest-level orientation when the user wants the next smallest useful review move.",
    title: "Get ROI review plan",
  },
  get_source_span: {
    description:
      "Return an exact source span and its source document. Use for provenance inspection before making claims.",
    title: "Get source span",
  },
  list_case_documents: {
    description:
      "List source documents projected into a case workspace, including OCR and storage identifiers.",
    title: "List case documents",
  },
  list_cases: {
    description:
      "List current user's case summaries. Use before case-scoped tools when the case ref is unknown.",
    title: "List cases",
  },
  preview_review_transition_plan: {
    description:
      "Preview the status changes a planned review action transition would make. This is a dry run; it does not mutate review actions or matterfacts.",
    title: "Preview review transition plan",
  },
  record_review_action_event: {
    description:
      "Append a case-scoped audit event for a review action and update action status for resolved, dismissed, or reopened events.",
    title: "Record review action event",
  },
  search_case_evidence: {
    description:
      "Deterministically search bounded workspace evidence across documents, source spans, facts, events, issues, review actions, and document updates.",
    title: "Search case evidence",
  },
} satisfies Record<MurdockMcpToolName, { description: string; title: string }>;

function inputJsonSchema(toolName: MurdockMcpToolName) {
  const schema = z.toJSONSchema(murdockMcpInputSchemas[toolName]);

  delete schema.$schema;

  return schema as Record<string, unknown>;
}

export const toolDescriptors = (Object.keys(toolMetadata) as MurdockMcpToolName[]).map(
  (name) => ({
    description: toolMetadata[name].description,
    inputSchema: inputJsonSchema(name),
    name,
    title: toolMetadata[name].title,
  }),
) satisfies MurdockMcpToolDescriptor[];
