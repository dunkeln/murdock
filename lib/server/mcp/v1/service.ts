import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  MURDOCK_MCP_VERSION,
  type MurdockMcpCaseRef,
  type MurdockMcpToolDescriptor,
  type MurdockMcpToolName,
  type MurdockMcpToolResult,
  getCaseReviewGroupOutputSchema,
  getCaseReviewDigestOutputSchema,
  getCaseContextOutputSchema,
  getDocumentUpdatesOutputSchema,
  getMatterSnapshotOutputSchema,
  getOpenReviewActionsOutputSchema,
  getOperationalSignalsOutputSchema,
  getSourceSpanOutputSchema,
  listCaseDocumentsOutputSchema,
  listCasesOutputSchema,
  murdockMcpInputSchemas,
  murdockMcpOutputSchemas,
  recordReviewActionEventOutputSchema,
  searchCaseEvidenceOutputSchema,
} from "@/lib/contracts/mcp";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import type { MatterOperationDto } from "@/lib/contracts/matter-operations";
import {
  caseReviewActionDtoSchema,
  type CaseReviewActionDto,
} from "@/lib/contracts/review-reducer";
import type { OperationalSignalDto } from "@/lib/contracts/operational-signals";
import { buildOperationalSignals } from "@/lib/operational-signals";
import { createNeonSql } from "@/lib/server/adapters/neon";
import { getCurrentUser } from "@/lib/server/auth/current-user";
import {
  getCurrentUserCaseWorkspaceById,
  getCurrentUserCaseWorkspaceBySlug,
} from "@/lib/server/case-workspace/service";
import { listCurrentUserCaseSummaries } from "@/lib/server/cases/service";
import { getDocumentRevisionSummariesByCaseId } from "@/lib/server/revisions/repository";
import { getMatterOperationalSnapshot } from "@/lib/server/matter-operations/service";

type MurdockMcpDependencies = {
  getCurrentUser: typeof getCurrentUser;
  getDocumentRevisionSummariesByCaseId: typeof getDocumentRevisionSummariesByCaseId;
  getMatterOperationalSnapshot: typeof getMatterOperationalSnapshot;
  getWorkspaceById: typeof getCurrentUserCaseWorkspaceById;
  getWorkspaceBySlug: typeof getCurrentUserCaseWorkspaceBySlug;
  listCases: typeof listCurrentUserCaseSummaries;
  recordReviewActionEvent: typeof recordReviewActionEvent;
};

const defaultDependencies: MurdockMcpDependencies = {
  getCurrentUser,
  getDocumentRevisionSummariesByCaseId,
  getMatterOperationalSnapshot,
  getWorkspaceById: getCurrentUserCaseWorkspaceById,
  getWorkspaceBySlug: getCurrentUserCaseWorkspaceBySlug,
  listCases: listCurrentUserCaseSummaries,
  recordReviewActionEvent,
};

const toolDescriptors = [
  {
    name: "list_cases",
    title: "List cases",
    description:
      "List current user's case summaries. Use before case-scoped tools when the case ref is unknown.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        limit: { default: 25, maximum: 50, minimum: 1, type: "integer" },
      },
      type: "object",
    },
  },
  {
    name: "get_case_context",
    title: "Get case context",
    description:
      "Return a bounded case workspace slice with documents, facts, chronology, issues, review actions, or source spans. Use for explicit section requests; prefer get_case_review_digest for broad questions about what needs attention.",
    inputSchema: {
      additionalProperties: false,
      properties: {
        caseId: { format: "uuid", type: "string" },
        caseSlug: { type: "string" },
        sections: {
          default: ["documents", "facts", "chronology", "issues", "review_actions"],
          items: {
            enum: [
              "documents",
              "facts",
              "chronology",
              "issues",
              "review_actions",
              "source_spans",
            ],
            type: "string",
          },
          type: "array",
        },
      },
      type: "object",
    },
  },
  {
    name: "get_case_review_digest",
    title: "Get case review digest",
    description:
      "Return a summary-only digest of open review work grouped for broad case-status questions. This is the first-call tool: it returns counts, group keys, omitted counts, and sample titles without full action summaries.",
    inputSchema: {
      ...caseRefJsonSchema(),
      properties: {
        ...caseRefJsonSchema().properties,
        includeLowPriority: { default: false, type: "boolean" },
      },
    },
  },
  {
    name: "get_case_review_group",
    title: "Get case review group",
    description:
      "Return detailed review items for one digest group after get_case_review_digest identifies the group to inspect. Use this for iterative drill-down instead of asking for all open review actions.",
    inputSchema: {
      ...caseRefJsonSchema(),
      properties: {
        ...caseRefJsonSchema().properties,
        groupKey: {
          enum: [
            "legal_judgment",
            "factual_completion",
            "document_updates",
            "operational_followup",
          ],
          type: "string",
        },
        includeLowPriority: { default: false, type: "boolean" },
        maxItems: { default: 10, maximum: 25, minimum: 1, type: "integer" },
      },
      required: ["groupKey"],
    },
  },
  {
    name: "list_case_documents",
    title: "List case documents",
    description:
      "List source documents projected into a case workspace, including OCR and storage identifiers.",
    inputSchema: caseRefJsonSchema(),
  },
  {
    name: "get_open_review_actions",
    title: "Get open review actions",
    description:
      "Return unresolved reduced review actions, optionally with their source spans for provenance. Use for follow-up detail; prefer get_case_review_digest for broad review summaries.",
    inputSchema: {
      ...caseRefJsonSchema(),
      properties: {
        ...caseRefJsonSchema().properties,
        includeSourceSpans: { default: true, type: "boolean" },
      },
    },
  },
  {
    name: "get_document_updates",
    title: "Get document updates",
    description:
      "Return document revision summaries for a case, optionally scoped to one source document.",
    inputSchema: {
      ...caseRefJsonSchema(),
      properties: {
        ...caseRefJsonSchema().properties,
        sourceDocumentRef: { pattern: "^doc_[a-f0-9]{16}$", type: "string" },
      },
    },
  },
  {
    name: "get_matter_snapshot",
    title: "Get matter snapshot",
    description:
      "Return the current operational matter state projected from review actions and document updates. Use this for broad questions about what is still active, blocked, resolved, ignored, untracked, or superseded.",
    inputSchema: {
      ...caseRefJsonSchema(),
      properties: {
        ...caseRefJsonSchema().properties,
        includeHistory: { default: false, type: "boolean" },
      },
    },
  },
  {
    name: "get_operational_signals",
    title: "Get operational signals",
    description:
      "Return a deterministic temporal signal projection from documents, document updates, and reduced review actions. Use this to understand what operationally changed without relying on workflow status labels.",
    inputSchema: {
      ...caseRefJsonSchema(),
      properties: {
        ...caseRefJsonSchema().properties,
        includeInformational: { default: true, type: "boolean" },
        limit: { default: 50, maximum: 100, minimum: 1, type: "integer" },
      },
    },
  },
  {
    name: "get_source_span",
    title: "Get source span",
    description:
      "Return an exact source span and its source document. Use for provenance inspection before making claims.",
    inputSchema: {
      ...caseRefJsonSchema(),
      properties: {
        ...caseRefJsonSchema().properties,
        sourceSpanRef: { pattern: "^span_[a-f0-9]{16}$", type: "string" },
      },
      required: ["sourceSpanRef"],
    },
  },
  {
    name: "search_case_evidence",
    title: "Search case evidence",
    description:
      "Deterministically search bounded workspace evidence across documents, source spans, facts, events, issues, review actions, and document updates.",
    inputSchema: {
      ...caseRefJsonSchema(),
      properties: {
        ...caseRefJsonSchema().properties,
        limit: { default: 10, maximum: 25, minimum: 1, type: "integer" },
        query: { maxLength: 160, minLength: 1, type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "record_review_action_event",
    title: "Record review action event",
    description:
      "Append a case-scoped audit event for a review action and update action status for resolved, dismissed, or reopened events.",
    inputSchema: {
      ...caseRefJsonSchema(),
      properties: {
        ...caseRefJsonSchema().properties,
        actionRef: { pattern: "^action_[a-f0-9]{16}$", type: "string" },
        eventType: {
          enum: ["comment", "resolved", "dismissed", "reopened"],
          type: "string",
        },
        note: { maxLength: 2000, minLength: 1, type: ["string", "null"] },
      },
      required: ["actionRef", "eventType"],
    },
  },
] satisfies MurdockMcpToolDescriptor[];

function caseRefJsonSchema() {
  return {
      additionalProperties: false,
      properties: {
        caseId: { format: "uuid", type: "string" },
        caseRef: { type: "string" },
        caseSlug: { type: "string" },
      },
      type: "object",
  };
}

function nowIso() {
  return new Date().toISOString();
}

type McpRefPrefix =
  | "action"
  | "claim"
  | "doc"
  | "event"
  | "fact"
  | "issue"
  | "operation"
  | "signal"
  | "span";

function opaqueRef(prefix: McpRefPrefix, id: string) {
  const digest = createHash("sha256")
    .update(`murdock-mcp.v1:${prefix}:${id}`)
    .digest("hex")
    .slice(0, 16);

  return `${prefix}_${digest}`;
}

function caseSummary(caseSummary: CaseWorkspaceDto["case"]) {
  return {
    caseRef: caseSummary.slug,
    clientName: caseSummary.clientName,
    nextAction: caseSummary.nextAction,
    nextDeadlineAt: caseSummary.nextDeadlineAt,
    priority: caseSummary.priority,
    title: caseSummary.title,
    type: caseSummary.type,
    updatedAt: caseSummary.updatedAt,
  };
}

function sourceDocumentRef(documentId: string) {
  return opaqueRef("doc", documentId);
}

function sourceSpanRef(sourceSpanId: string) {
  return opaqueRef("span", sourceSpanId);
}

function reviewActionRef(actionId: string) {
  return opaqueRef("action", actionId);
}

function revisionClaimRef(claimId: string) {
  return opaqueRef("claim", claimId);
}

function sourceSpanRefs(sourceSpanIds: string[]) {
  return sourceSpanIds.map(sourceSpanRef);
}

function mapSourceDocument(
  document: CaseWorkspaceDto["sourceDocuments"][number],
) {
  return {
    documentRef: sourceDocumentRef(document.id),
    fileName: document.fileName,
    mimeType: document.mimeType,
    ocrStatus: document.ocrStatus,
    receivedAt: document.receivedAt,
    sizeBytes: document.sizeBytes,
    sourceDate: document.sourceDate,
    sourceKind: document.sourceKind,
    title: document.title,
  };
}

function mapSourceSpan(span: CaseWorkspaceDto["sourceSpans"][number]) {
  return {
    confidence: span.confidence,
    fieldPath: span.fieldPath,
    pageIndex: span.pageIndex,
    pageLabel: span.pageLabel,
    sourceDocumentRef: sourceDocumentRef(span.sourceDocumentId),
    sourceSpanRef: sourceSpanRef(span.id),
    verbatimExcerpt: span.verbatimExcerpt,
  };
}

function mapReviewAction(action: CaseReviewActionDto) {
  return {
    actionLabel: action.actionLabel,
    actionRef: reviewActionRef(action.id),
    blocking: action.blocking,
    kind: action.kind,
    priority: action.priority,
    requiredCapability: action.requiredCapability,
    resolvedAt: action.resolvedAt,
    sourceSpanCount: action.sourceSpanIds.length,
    sourceSpanRefs: sourceSpanRefs(action.sourceSpanIds),
    status: action.status,
    summary: action.summary,
    title: action.title,
  };
}

function mapFact(fact: CaseWorkspaceDto["facts"][number]) {
  return {
    calculatedValue: fact.calculatedValue,
    category: fact.category,
    categoryDetail: fact.categoryDetail,
    confidence: fact.confidence,
    effectiveAt: fact.effectiveAt,
    factRef: opaqueRef("fact", fact.id),
    isCurrent: fact.isCurrent,
    label: fact.label,
    normalizedValue: fact.normalizedValue,
    observedAt: fact.observedAt,
    sourceSpanCount: fact.sourceSpanIds.length,
    sourceSpanRefs: sourceSpanRefs(fact.sourceSpanIds),
    statedValue: fact.statedValue,
    valueType: fact.valueType,
  };
}

function mapChronologyEvent(
  event: CaseWorkspaceDto["chronologyEvents"][number],
) {
  return {
    confidence: event.confidence,
    description: event.description,
    eventKind: event.eventKind,
    eventRef: opaqueRef("event", event.id),
    occurredAt: event.occurredAt,
    occurredAtPrecision: event.occurredAtPrecision,
    sourceSpanCount: event.sourceSpanIds.length,
    sourceSpanRefs: sourceSpanRefs(event.sourceSpanIds),
    title: event.title,
  };
}

function mapIssue(issue: CaseWorkspaceDto["issues"][number]) {
  return {
    description: issue.description,
    issueRef: opaqueRef("issue", issue.id),
    issueType: issue.issueType,
    provenanceSummary: issue.provenanceSummary,
    relatedEventRefs: issue.relatedEventIds.map((id) => opaqueRef("event", id)),
    relatedFactRefs: issue.relatedFactIds.map((id) => opaqueRef("fact", id)),
    severity: issue.severity,
    sourceSpanCount: issue.sourceSpanIds.length,
    sourceSpanRefs: sourceSpanRefs(issue.sourceSpanIds),
    status: issue.status,
    title: issue.title,
  };
}

function mapRevisionSummary(revision: DocumentRevisionSummaryDto) {
  return {
    claims: revision.claims.map((claim) => ({
      afterSourceSpanRefs: sourceSpanRefs(claim.afterSourceSpanIds),
      afterValue: claim.afterValue,
      beforeSourceSpanRefs: sourceSpanRefs(claim.beforeSourceSpanIds),
      beforeValue: claim.beforeValue,
      changeType: claim.changeType,
      claimRef: revisionClaimRef(claim.id),
      confidence: claim.confidence,
      fieldLabel: claim.fieldLabel,
      fieldPath: claim.fieldPath,
      status: claim.status,
    })),
    documentLabel: revision.documentLabel,
    fromVersionLabel: revision.fromVersionLabel,
    toVersionLabel: revision.toVersionLabel,
  };
}

function mapOperationalSignal(signal: OperationalSignalDto) {
  return {
    actorType: signal.actorType,
    generatedBy: signal.generatedBy,
    importance: signal.importance,
    observedAt: signal.observedAt,
    occurredAt: signal.occurredAt,
    signalRef: opaqueRef("signal", signal.id),
    signalType: signal.signalType,
    sourceRefCount: signal.sourceRefs.length,
    sourceSpanCount: signal.sourceSpanIds.length,
    state: signal.state,
    summary: signal.summary,
    title: signal.title,
  };
}

function mapMatterOperation(operation: MatterOperationDto) {
  return {
    blocking: operation.blocking,
    current: operation.current,
    operationRef: opaqueRef("operation", operation.id),
    priority: operation.priority,
    provenanceRefCount: operation.provenanceRefs.length,
    requiredCapability: operation.requiredCapability,
    sourceType: operation.sourceType,
    state: operation.state,
    summary: operation.summary,
    title: operation.title,
    updatedAt: operation.updatedAt,
  };
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function scoreText(text: string, query: string) {
  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);

  if (!normalizedText || !normalizedQuery) {
    return 0;
  }

  if (normalizedText.includes(normalizedQuery)) {
    return normalizedQuery.length + 10;
  }

  return normalizedQuery
    .split(" ")
    .filter((term) => term.length > 1 && normalizedText.includes(term)).length;
}

function openActions(workspace: CaseWorkspaceDto) {
  return workspace.reviewActions.filter((action) => action.status === "open");
}

const priorityRank: Record<CaseReviewActionDto["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const digestGroups = [
  {
    audience: "legal_judgment",
    description:
      "Conflicts or legal choices that need qualified legal judgment before filing decisions are made.",
    key: "legal_judgment",
    label: "Legal judgment",
  },
  {
    audience: "factual_completion",
    description:
      "Blocking form-filling or attachment work that should be completed before the case proceeds.",
    key: "factual_completion",
    label: "Factual completion",
  },
  {
    audience: "document_version_review",
    description:
      "Document revision changes that may affect what the reviewer should compare or confirm.",
    key: "document_updates",
    label: "Document updates",
  },
  {
    audience: "operational_followup",
    description:
      "Nonblocking cleanup items that can be handled after the blocking work is understood.",
    key: "operational_followup",
    label: "Operational follow-up",
  },
] as const;

type DigestGroupKey = (typeof digestGroups)[number]["key"];

function sortReviewActions(left: CaseReviewActionDto, right: CaseReviewActionDto) {
  return (
    priorityRank[left.priority] - priorityRank[right.priority] ||
    Number(right.blocking) - Number(left.blocking) ||
    left.title.localeCompare(right.title)
  );
}

function digestGroupKey(action: CaseReviewActionDto): DigestGroupKey {
  if (action.requiredCapability === "legal_judgment") {
    return "legal_judgment";
  }

  if (action.requiredCapability === "document_version_review") {
    return "document_updates";
  }

  if (
    action.requiredCapability === "factual_completion" ||
    action.requiredCapability === "filing_preparation" ||
    action.requiredCapability === "source_verification"
  ) {
    return "factual_completion";
  }

  return "operational_followup";
}

function highestPriority(actions: CaseReviewActionDto[]) {
  return actions.reduce<CaseReviewActionDto["priority"]>(
    (highest, action) =>
      priorityRank[action.priority] < priorityRank[highest]
        ? action.priority
        : highest,
    "low",
  );
}

function reviewDigestItem(action: CaseReviewActionDto) {
  return {
    actionRef: reviewActionRef(action.id),
    blocking: action.blocking,
    kind: action.kind,
    priority: action.priority,
    requiredCapability: action.requiredCapability,
    sourceSpanCount: action.sourceSpanIds.length,
    summary: action.summary,
    title: action.title,
  };
}

function groupedReviewActions(input: {
  includeLowPriority: boolean;
  workspace: CaseWorkspaceDto;
}) {
  const actions = openActions(input.workspace);
  const visibleActions = input.includeLowPriority
    ? actions
    : actions.filter((action) => action.priority !== "low");

  return {
    actions,
    groups: digestGroups.map((definition) => ({
      definition,
      groupActions: visibleActions
        .filter((action) => digestGroupKey(action) === definition.key)
        .sort(sortReviewActions),
    })),
  };
}

function buildReviewDigest(input: {
  includeLowPriority: boolean;
  workspace: CaseWorkspaceDto;
}) {
  const { actions, groups: groupedActions } = groupedReviewActions(input);

  const groups = digestGroups.flatMap((definition) => {
    const groupActions =
      groupedActions.find((group) => group.definition.key === definition.key)
        ?.groupActions ?? [];

    if (groupActions.length === 0) {
      return [];
    }

    const sampleTitles = groupActions.slice(0, 2).map((action) => action.title);

    return [
      {
        ...definition,
        itemCount: groupActions.length,
        items: [],
        omittedCount: groupActions.length,
        priority: highestPriority(groupActions),
        sampleTitles,
      },
    ];
  });

  return {
    case: caseSummary(input.workspace.case),
    counts: {
      blockingOpenActionCount: actions.filter((action) => action.blocking).length,
      conflictOpenActionCount: actions.filter((action) => action.kind === "conflict")
        .length,
      lowPriorityOpenActionCount: actions.filter((action) => action.priority === "low")
        .length,
      omittedLowPriorityCount: input.includeLowPriority
        ? 0
        : actions.filter((action) => action.priority === "low").length,
      openActionCount: actions.length,
      revisionOpenActionCount: actions.filter((action) => action.kind === "revision")
        .length,
    },
    generatedAt: nowIso(),
    groups,
  };
}

function buildReviewGroup(input: {
  groupKey: DigestGroupKey;
  includeLowPriority: boolean;
  maxItems: number;
  workspace: CaseWorkspaceDto;
}) {
  const { groups } = groupedReviewActions(input);
  const selectedGroup = groups.find(
    (group) => group.definition.key === input.groupKey,
  );
  const groupActions = selectedGroup?.groupActions ?? [];
  const definition =
    selectedGroup?.definition ??
    digestGroups.find((group) => group.key === input.groupKey);

  if (!definition) {
    throw new MurdockMcpServiceError(
      "schema_validation",
      "Unknown review digest group.",
      false,
    );
  }

  const items = groupActions.slice(0, input.maxItems).map(reviewDigestItem);

  return {
    case: caseSummary(input.workspace.case),
    generatedAt: nowIso(),
    group: {
      ...definition,
      itemCount: groupActions.length,
      items,
      omittedCount: Math.max(0, groupActions.length - items.length),
      priority: highestPriority(groupActions),
      sampleTitles: groupActions.slice(0, 2).map((action) => action.title),
    },
  };
}

async function loadWorkspace(
  caseRef: MurdockMcpCaseRef,
  deps: MurdockMcpDependencies,
) {
  const result = caseRef.caseId
    ? await deps.getWorkspaceById(caseRef.caseId)
    : await deps.getWorkspaceBySlug(caseRef.caseRef ?? caseRef.caseSlug ?? "");

  if (!result.ok) {
    throw new MurdockMcpServiceError(
      result.error.errorCategory === "not_found" ? "not_found" : "unknown",
      result.error.message,
      result.error.isRetryable,
    );
  }

  return result.workspace;
}

function matchingSourceSpans(
  workspace: CaseWorkspaceDto,
  reviewActions: CaseReviewActionDto[],
) {
  const sourceSpanIds = new Set(
    reviewActions.flatMap((action) => action.sourceSpanIds),
  );

  return workspace.sourceSpans.filter((span) => sourceSpanIds.has(span.id));
}

function resolveSourceDocumentId(
  workspace: CaseWorkspaceDto,
  documentRef: string | undefined,
) {
  if (!documentRef) {
    return undefined;
  }

  const document = workspace.sourceDocuments.find(
    (candidate) => sourceDocumentRef(candidate.id) === documentRef,
  );

  if (!document) {
    throw new MurdockMcpServiceError(
      "not_found",
      "Source document reference not found for this case.",
      false,
    );
  }

  return document.id;
}

function resolveSourceSpan(
  workspace: CaseWorkspaceDto,
  spanRef: string,
) {
  const sourceSpan = workspace.sourceSpans.find(
    (candidate) => sourceSpanRef(candidate.id) === spanRef,
  );

  if (!sourceSpan) {
    throw new MurdockMcpServiceError(
      "not_found",
      "Source span reference not found for this case.",
      false,
    );
  }

  return sourceSpan;
}

function resolveReviewAction(
  workspace: CaseWorkspaceDto,
  actionRef: string,
) {
  const action = workspace.reviewActions.find(
    (candidate) => reviewActionRef(candidate.id) === actionRef,
  );

  if (!action) {
    throw new MurdockMcpServiceError(
      "not_found",
      "Review action reference not found for this case.",
      false,
    );
  }

  return action;
}

function filteredRevisions(
  revisions: DocumentRevisionSummaryDto[],
  sourceDocumentId: string | undefined,
) {
  if (!sourceDocumentId) {
    return revisions;
  }

  return revisions.filter(
    (revision) =>
      revision.fromSourceDocumentId === sourceDocumentId ||
      revision.toSourceDocumentId === sourceDocumentId,
  );
}

function evidenceMatches(input: {
  limit: number;
  query: string;
  revisions: DocumentRevisionSummaryDto[];
  workspace: CaseWorkspaceDto;
}) {
  const operationalSignals = buildOperationalSignals({
    documentRevisions: input.revisions,
    workspace: input.workspace,
  });
  const candidates = [
    ...input.workspace.sourceDocuments.map((document) => ({
      documentRef: sourceDocumentRef(document.id),
      fieldPath: null,
      kind: "source_document" as const,
      label: document.title,
      sourceSpanRefs: [],
      text: [document.title, document.fileName, document.sourceKind].join(" "),
    })),
    ...input.workspace.sourceSpans.map((span) => ({
      documentRef: sourceDocumentRef(span.sourceDocumentId),
      fieldPath: span.fieldPath,
      kind: "source_span" as const,
      label: span.fieldPath ?? span.spanKey,
      sourceSpanRefs: [sourceSpanRef(span.id)],
      text: span.verbatimExcerpt,
    })),
    ...input.workspace.facts.map((fact) => ({
      documentRef: null,
      fieldPath: null,
      kind: "fact" as const,
      label: fact.label,
      sourceSpanRefs: sourceSpanRefs(fact.sourceSpanIds),
      text: [
        fact.label,
        fact.category,
        fact.categoryDetail,
        fact.statedValue,
        fact.normalizedValue,
        fact.calculatedValue,
      ].join(" "),
    })),
    ...input.workspace.chronologyEvents.map((event) => ({
      documentRef: null,
      fieldPath: null,
      kind: "chronology_event" as const,
      label: event.title,
      sourceSpanRefs: sourceSpanRefs(event.sourceSpanIds),
      text: [event.title, event.description, event.eventKind].join(" "),
    })),
    ...input.workspace.issues.map((issue) => ({
      documentRef: null,
      fieldPath: null,
      kind: "issue" as const,
      label: issue.title,
      sourceSpanRefs: sourceSpanRefs(issue.sourceSpanIds),
      text: [
        issue.title,
        issue.description,
        issue.provenanceSummary,
        issue.issueType,
      ].join(" "),
    })),
    ...input.workspace.reviewActions.map((action) => ({
      documentRef: null,
      fieldPath: null,
      kind: "review_action" as const,
      label: action.title,
      sourceSpanRefs: sourceSpanRefs(action.sourceSpanIds),
      text: [
        action.title,
        action.summary,
        action.actionLabel,
        action.kind,
        action.priority,
      ].join(" "),
    })),
    ...input.revisions.flatMap((revision) =>
      revision.claims.map((claim) => ({
        documentRef: sourceDocumentRef(revision.toSourceDocumentId),
        fieldPath: claim.fieldPath,
        kind: "document_update" as const,
        label: claim.fieldLabel,
        sourceSpanRefs: sourceSpanRefs([
          ...claim.beforeSourceSpanIds,
          ...claim.afterSourceSpanIds,
        ]),
        text: [
          revision.documentLabel,
          revision.fromVersionLabel,
          revision.toVersionLabel,
          claim.fieldLabel,
          claim.changeType,
          valueText(claim.beforeValue),
          valueText(claim.afterValue),
        ].join(" "),
      })),
    ),
    ...operationalSignals.map((signal) => ({
      documentRef: null,
      fieldPath: null,
      kind: "operational_signal" as const,
      label: signal.title,
      sourceSpanRefs: sourceSpanRefs(signal.sourceSpanIds),
      text: [
        signal.title,
        signal.summary,
        signal.signalType,
        signal.state,
        signal.generatedBy,
      ].join(" "),
    })),
  ];

  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreText([candidate.label, candidate.text].join(" "), input.query),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, input.limit);
}

class MurdockMcpServiceError extends Error {
  constructor(
    readonly errorCategory: Exclude<
      MurdockMcpToolResult,
      { ok: true }
    >["errorCategory"],
    message: string,
    readonly isRetryable = false,
  ) {
    super(message);
  }
}

async function recordReviewActionEvent(input: {
  actionId: string;
  actorId: string | null;
  caseId: string;
  eventType: "comment" | "resolved" | "dismissed" | "reopened";
  note: string | null;
}) {
  const sql = createNeonSql();
  const status =
    input.eventType === "resolved" || input.eventType === "dismissed"
      ? input.eventType
      : input.eventType === "reopened"
        ? "open"
        : null;
  const rows = await sql`
    with action_update as (
      update public.case_review_actions
      set
        status = coalesce(${status}, status),
        resolved_at = case
          when ${input.eventType} = 'resolved' then now()
          when ${input.eventType} = 'reopened' then null
          else resolved_at
        end,
        updated_at = now()
      where id = ${input.actionId}
        and case_id = ${input.caseId}
      returning
        id,
        case_id,
        reducer_run_id,
        action_key,
        kind,
        priority,
        required_capability,
        blocking,
        status,
        title,
        summary,
        action_label,
        source_span_ids,
        raw_refs,
        resolved_at,
        created_at,
        updated_at
    ),
    event_insert as (
      insert into public.case_review_action_events (
        case_id,
        action_id,
        event_type,
        actor_id,
        note
      )
      select
        ${input.caseId},
        id,
        ${input.eventType},
        ${input.actorId},
        ${input.note}
      from action_update
      returning id
    )
    select *
    from action_update
  `;
  const [row] = rows as Array<Record<string, unknown>>;

  if (!row) {
    throw new MurdockMcpServiceError(
      "not_found",
      "Review action not found for this case.",
      false,
    );
  }

  return row;
}

function toolData<TName extends MurdockMcpToolName>(
  toolName: TName,
  data: unknown,
) {
  return murdockMcpOutputSchemas[toolName].parse(data);
}

function toolError(input: {
  errorCategory: Exclude<MurdockMcpToolResult, { ok: true }>["errorCategory"];
  isRetryable: boolean;
  message: string;
  toolName: MurdockMcpToolName | null;
}): MurdockMcpToolResult {
  return {
    errorCategory: input.errorCategory,
    isRetryable: input.isRetryable,
    message: input.message,
    ok: false,
    toolName: input.toolName,
    version: MURDOCK_MCP_VERSION,
  };
}

export function getMurdockMcpV1ToolDescriptors(): MurdockMcpToolDescriptor[] {
  return toolDescriptors;
}

export async function executeMurdockMcpV1Tool(
  toolName: string,
  rawInput: unknown,
  dependencies: Partial<MurdockMcpDependencies> = {},
): Promise<MurdockMcpToolResult> {
  const parsedToolName = z
    .enum([
      "list_cases",
      "get_case_context",
      "get_case_review_digest",
      "get_case_review_group",
      "list_case_documents",
      "get_open_review_actions",
      "get_document_updates",
      "get_matter_snapshot",
      "get_operational_signals",
      "get_source_span",
      "search_case_evidence",
      "record_review_action_event",
    ])
    .safeParse(toolName);

  if (!parsedToolName.success) {
    return toolError({
      errorCategory: "unsupported_tool",
      isRetryable: false,
      message: "Unsupported Murdock MCP tool.",
      toolName: null,
    });
  }

  const name = parsedToolName.data;
  const parsedInput = murdockMcpInputSchemas[name].safeParse(rawInput ?? {});

  if (!parsedInput.success) {
    return toolError({
      errorCategory: "schema_validation",
      isRetryable: false,
      message: parsedInput.error.issues[0]?.message ?? "Invalid MCP tool input.",
      toolName: name,
    });
  }

  const deps = { ...defaultDependencies, ...dependencies };

  try {
    const data = await executeParsedTool(name, parsedInput.data, deps);

    return {
      data: toolData(name, data),
      ok: true,
      toolName: name,
      version: MURDOCK_MCP_VERSION,
    };
  } catch (error) {
    if (error instanceof MurdockMcpServiceError) {
      return toolError({
        errorCategory: error.errorCategory,
        isRetryable: error.isRetryable,
        message: error.message,
        toolName: name,
      });
    }

    return toolError({
      errorCategory: "unknown",
      isRetryable: false,
      message: error instanceof Error ? error.message : "Unknown MCP tool error.",
      toolName: name,
    });
  }
}

async function executeParsedTool(
  name: MurdockMcpToolName,
  input: unknown,
  deps: MurdockMcpDependencies,
) {
  if (name === "list_cases") {
    const parsed = murdockMcpInputSchemas.list_cases.parse(input);
    const cases = await deps.listCases();

    return listCasesOutputSchema.parse({
      cases: cases.slice(0, parsed.limit).map(caseSummary),
      generatedAt: nowIso(),
    });
  }

  if (name === "get_case_context") {
    const parsed = murdockMcpInputSchemas.get_case_context.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const sectionSet = new Set(parsed.sections);

    return getCaseContextOutputSchema.parse({
      case: caseSummary(workspace.case),
      chronologyEvents: sectionSet.has("chronology")
        ? workspace.chronologyEvents.map(mapChronologyEvent)
        : undefined,
      counts: {
        chronologyEventCount: workspace.chronologyEvents.length,
        documentCount: workspace.sourceDocuments.length,
        factCount: workspace.facts.length,
        issueCount: workspace.issues.length,
        openReviewActionCount: openActions(workspace).length,
        sourceSpanCount: workspace.sourceSpans.length,
      },
      facts: sectionSet.has("facts") ? workspace.facts.map(mapFact) : undefined,
      generatedAt: nowIso(),
      issues: sectionSet.has("issues") ? workspace.issues.map(mapIssue) : undefined,
      reviewActions: sectionSet.has("review_actions")
        ? workspace.reviewActions.map(mapReviewAction)
        : undefined,
      sourceDocuments: sectionSet.has("documents")
        ? workspace.sourceDocuments.map(mapSourceDocument)
        : undefined,
      sourceSpans: sectionSet.has("source_spans")
        ? workspace.sourceSpans.map(mapSourceSpan)
        : undefined,
    });
  }

  if (name === "get_case_review_digest") {
    const parsed = murdockMcpInputSchemas.get_case_review_digest.parse(input);
    const workspace = await loadWorkspace(parsed, deps);

    return getCaseReviewDigestOutputSchema.parse(
      buildReviewDigest({
        includeLowPriority: parsed.includeLowPriority,
        workspace,
      }),
    );
  }

  if (name === "get_case_review_group") {
    const parsed = murdockMcpInputSchemas.get_case_review_group.parse(input);
    const workspace = await loadWorkspace(parsed, deps);

    return getCaseReviewGroupOutputSchema.parse(
      buildReviewGroup({
        groupKey: parsed.groupKey,
        includeLowPriority: parsed.includeLowPriority,
        maxItems: parsed.maxItems,
        workspace,
      }),
    );
  }

  if (name === "list_case_documents") {
    const parsed = murdockMcpInputSchemas.list_case_documents.parse(input);
    const workspace = await loadWorkspace(parsed, deps);

    return listCaseDocumentsOutputSchema.parse({
      case: caseSummary(workspace.case),
      generatedAt: nowIso(),
      sourceDocuments: workspace.sourceDocuments.map(mapSourceDocument),
    });
  }

  if (name === "get_open_review_actions") {
    const parsed = murdockMcpInputSchemas.get_open_review_actions.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const reviewActions = openActions(workspace);

    return getOpenReviewActionsOutputSchema.parse({
      case: caseSummary(workspace.case),
      generatedAt: nowIso(),
      reviewActions: reviewActions.map(mapReviewAction),
      sourceSpans: parsed.includeSourceSpans
        ? matchingSourceSpans(workspace, reviewActions).map(mapSourceSpan)
        : undefined,
    });
  }

  if (name === "get_document_updates") {
    const parsed = murdockMcpInputSchemas.get_document_updates.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const sourceDocumentId = resolveSourceDocumentId(
      workspace,
      parsed.sourceDocumentRef,
    );
    const revisions = await deps.getDocumentRevisionSummariesByCaseId({
      caseId: workspace.case.id,
    });

    return getDocumentUpdatesOutputSchema.parse({
      case: caseSummary(workspace.case),
      generatedAt: nowIso(),
      revisions: filteredRevisions(revisions, sourceDocumentId).map(
        mapRevisionSummary,
      ),
    });
  }

  if (name === "get_operational_signals") {
    const parsed = murdockMcpInputSchemas.get_operational_signals.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const revisions = await deps.getDocumentRevisionSummariesByCaseId({
      caseId: workspace.case.id,
    });
    const signals = buildOperationalSignals({
      documentRevisions: revisions,
      workspace,
    }).filter(
      (signal) => parsed.includeInformational || signal.state !== "informational",
    );

    return getOperationalSignalsOutputSchema.parse({
      case: caseSummary(workspace.case),
      generatedAt: nowIso(),
      signals: signals.slice(0, parsed.limit).map(mapOperationalSignal),
    });
  }

  if (name === "get_matter_snapshot") {
    const parsed = murdockMcpInputSchemas.get_matter_snapshot.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const snapshot = await deps.getMatterOperationalSnapshot({
      caseId: workspace.case.id,
      includeHistory: parsed.includeHistory,
    });

    return getMatterSnapshotOutputSchema.parse({
      activeOperations: snapshot.activeOperations.map(mapMatterOperation),
      case: caseSummary(workspace.case),
      counts: snapshot.counts,
      currentOperations: snapshot.currentOperations.map(mapMatterOperation),
      generatedAt: snapshot.generatedAt,
      historyIncluded: parsed.includeHistory,
    });
  }

  if (name === "get_source_span") {
    const parsed = murdockMcpInputSchemas.get_source_span.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const sourceSpan = resolveSourceSpan(workspace, parsed.sourceSpanRef);

    return getSourceSpanOutputSchema.parse({
      case: caseSummary(workspace.case),
      generatedAt: nowIso(),
      sourceDocument:
        workspace.sourceDocuments
          .filter((document) => document.id === sourceSpan.sourceDocumentId)
          .map(mapSourceDocument)[0] ?? null,
      sourceSpan: mapSourceSpan(sourceSpan),
    });
  }

  if (name === "search_case_evidence") {
    const parsed = murdockMcpInputSchemas.search_case_evidence.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const revisions = await deps.getDocumentRevisionSummariesByCaseId({
      caseId: workspace.case.id,
    });

    return searchCaseEvidenceOutputSchema.parse({
      case: caseSummary(workspace.case),
      generatedAt: nowIso(),
      matches: evidenceMatches({
        limit: parsed.limit,
        query: parsed.query,
        revisions,
        workspace,
      }),
      query: parsed.query,
    });
  }

  const parsed = murdockMcpInputSchemas.record_review_action_event.parse(input);
  const workspace = await loadWorkspace(parsed, deps);
  const action = resolveReviewAction(workspace, parsed.actionRef);
  const user = await deps.getCurrentUser();
  const row = await deps.recordReviewActionEvent({
    actionId: action.id,
    actorId: user.id,
    caseId: workspace.case.id,
    eventType: parsed.eventType,
    note: parsed.note,
  });
  const updatedAction = caseReviewActionDtoSchema.parse({
    ...action,
    ...rowToReviewActionPatch(row),
  });

  return recordReviewActionEventOutputSchema.parse({
    action: mapReviewAction(updatedAction),
    eventType: parsed.eventType,
    generatedAt: nowIso(),
  });
}

function rowToReviewActionPatch(row: Record<string, unknown>) {
  return {
    actionKey: row.action_key,
    actionLabel: row.action_label,
    blocking: row.blocking,
    caseId: row.case_id,
    createdAt: toIso(row.created_at),
    id: row.id,
    kind: row.kind,
    priority: row.priority,
    requiredCapability: row.required_capability ?? "operational_followup",
    rawRefs: row.raw_refs,
    reducerRunId: row.reducer_run_id,
    resolvedAt: toIso(row.resolved_at),
    sourceSpanIds: row.source_span_ids,
    status: row.status,
    summary: row.summary,
    title: row.title,
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
