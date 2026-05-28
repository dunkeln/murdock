import "server-only";

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
  getCaseActionQueueOutputSchema,
  getHarnessViewOutputSchema,
  getMatterSnapshotOutputSchema,
  getOpenReviewActionsOutputSchema,
  getOperationalSignalsOutputSchema,
  getSourceSpanOutputSchema,
  listCaseDocumentsOutputSchema,
  listCasesOutputSchema,
  previewReviewTransitionPlanOutputSchema,
  murdockMcpInputSchemas,
  murdockMcpOutputSchemas,
  murdockMcpToolNameSchema,
  recordReviewActionEventOutputSchema,
  searchCaseEvidenceOutputSchema,
  upsertCaseActionTaskOutputSchema,
} from "@/lib/contracts/mcp";
import { reviewWorkItemSchema } from "@/lib/contracts/review-work-item";
import { buildOperationalSignals } from "@/lib/operational-signals";
import { getCurrentUser } from "@/lib/server/auth/current-user";
import {
  getCurrentUserCaseWorkspaceById,
  getCurrentUserCaseWorkspaceBySlug,
} from "@/lib/server/case-workspace/service";
import { listCurrentUserCaseSummaries } from "@/lib/server/cases/service";
import { getDocumentRevisionSummariesByCaseId } from "@/lib/server/revisions/repository";
import { getMatterOperationalSnapshot } from "@/lib/server/matter-operations/service";
import {
  listCaseActionTasks,
  upsertCaseActionTask,
} from "@/lib/server/case-action-tasks/service";
import {
  getCurrentUserHarnessViewById,
  getCurrentUserHarnessViewBySlug,
} from "@/lib/server/harness-view/service";
import { toolDescriptors } from "@/lib/server/mcp/v1/descriptors";
import { MurdockMcpServiceError } from "@/lib/server/mcp/v1/errors";
import { evidenceMatches } from "@/lib/server/mcp/v1/evidence-search";
import {
  caseSummary,
  filteredRevisions,
  mapChronologyEvent,
  mapFact,
  mapIssue,
  mapMatterOperation,
  mapCaseActionTask,
  mapOperationalSignal,
  mapReviewAction,
  mapRevisionSummary,
  mapSourceDocument,
  mapSourceSpan,
  matchingSourceSpans,
  nowIso,
  openReviewWorkItems,
  resolveReviewAction,
  resolveSourceDocumentId,
  resolveSourceSpan,
  reviewWorkItemRef,
  toIso,
} from "@/lib/server/mcp/v1/projections";
import { recordReviewActionEvent } from "@/lib/server/mcp/v1/review-events";
import {
  buildReviewDigest,
  buildReviewGroup,
  statusAfterReviewEvent,
  transitionPreviewWarnings,
} from "@/lib/server/mcp/v1/review-planning";
import { buildActionableChoices } from "@/lib/server/subagents/actionables/service";

type MurdockMcpDependencies = {
  getCurrentUser: typeof getCurrentUser;
  getDocumentRevisionSummariesByCaseId: typeof getDocumentRevisionSummariesByCaseId;
  getMatterOperationalSnapshot: typeof getMatterOperationalSnapshot;
  listCaseActionTasks: typeof listCaseActionTasks;
  getWorkspaceById: typeof getCurrentUserCaseWorkspaceById;
  getWorkspaceBySlug: typeof getCurrentUserCaseWorkspaceBySlug;
  listCases: typeof listCurrentUserCaseSummaries;
  recordReviewActionEvent: typeof recordReviewActionEvent;
  upsertCaseActionTask: typeof upsertCaseActionTask;
};

const defaultDependencies: MurdockMcpDependencies = {
  getCurrentUser,
  getDocumentRevisionSummariesByCaseId,
  getMatterOperationalSnapshot,
  listCaseActionTasks,
  getWorkspaceById: getCurrentUserCaseWorkspaceById,
  getWorkspaceBySlug: getCurrentUserCaseWorkspaceBySlug,
  listCases: listCurrentUserCaseSummaries,
  recordReviewActionEvent,
  upsertCaseActionTask,
};

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

async function loadHarnessView(caseRef: MurdockMcpCaseRef) {
  const result = caseRef.caseId
    ? await getCurrentUserHarnessViewById(caseRef.caseId)
    : await getCurrentUserHarnessViewBySlug(
        caseRef.caseRef ?? caseRef.caseSlug ?? "",
      );

  if (!result.ok) {
    throw new MurdockMcpServiceError(
      result.error.errorCategory === "not_found" ? "not_found" : "unknown",
      result.error.message,
      result.error.isRetryable,
    );
  }

  return result.harnessView;
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
  const parsedToolName = murdockMcpToolNameSchema.safeParse(toolName);

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
    const data = await toolHandlers[name](parsedInput.data, deps);

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

type McpToolHandler = (
  input: unknown,
  deps: MurdockMcpDependencies,
) => Promise<unknown> | unknown;

async function handleActionableChoices(
  input: unknown,
  deps: MurdockMcpDependencies,
) {
  const parsed = murdockMcpInputSchemas.get_actionable_choices.parse(input);
  const harnessView = await loadHarnessView(parsed);
  const tasks = await deps.listCaseActionTasks({
    caseId: harnessView.case.id,
    includeDone: false,
    limit: 100,
  });

  return buildActionableChoices({
    activeReviewRef: parsed.activeReviewRef ?? null,
    harnessView,
    maxChoices: parsed.maxChoices,
    tasks,
  });
}

const toolHandlers = {
  list_cases: async (input, deps) => {
    const parsed = murdockMcpInputSchemas.list_cases.parse(input);
    const cases = await deps.listCases();

    return listCasesOutputSchema.parse({
      cases: cases.slice(0, parsed.limit).map(caseSummary),
      generatedAt: nowIso(),
    });
  },

  get_harness_view: async (input) => {
    const parsed = murdockMcpInputSchemas.get_harness_view.parse(input);
    const harnessView = await loadHarnessView(parsed);

    return getHarnessViewOutputSchema.parse(harnessView);
  },

  get_case_context: async (input, deps) => {
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
        openReviewActionCount: openReviewWorkItems(workspace).length,
        sourceSpanCount: workspace.sourceSpans.length,
      },
      facts: sectionSet.has("facts") ? workspace.facts.map(mapFact) : undefined,
      generatedAt: nowIso(),
      issues: sectionSet.has("issues") ? workspace.issues.map(mapIssue) : undefined,
      reviewActions: sectionSet.has("review_actions")
        ? workspace.reviewWorkItems.map(mapReviewAction)
        : undefined,
      sourceDocuments: sectionSet.has("documents")
        ? workspace.sourceDocuments.map(mapSourceDocument)
        : undefined,
      sourceSpans: sectionSet.has("source_spans")
        ? workspace.sourceSpans.map(mapSourceSpan)
        : undefined,
    });
  },

  get_case_review_digest: async (input, deps) => {
    const parsed = murdockMcpInputSchemas.get_case_review_digest.parse(input);
    const workspace = await loadWorkspace(parsed, deps);

    return getCaseReviewDigestOutputSchema.parse(
      buildReviewDigest({
        includeLowPriority: parsed.includeLowPriority,
        workspace,
      }),
    );
  },

  get_case_review_group: async (input, deps) => {
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
  },

  list_case_documents: async (input, deps) => {
    const parsed = murdockMcpInputSchemas.list_case_documents.parse(input);
    const workspace = await loadWorkspace(parsed, deps);

    return listCaseDocumentsOutputSchema.parse({
      case: caseSummary(workspace.case),
      generatedAt: nowIso(),
      sourceDocuments: workspace.sourceDocuments.map(mapSourceDocument),
    });
  },

  get_open_review_actions: async (input, deps) => {
    const parsed = murdockMcpInputSchemas.get_open_review_actions.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const reviewActions = openReviewWorkItems(workspace);

    return getOpenReviewActionsOutputSchema.parse({
      case: caseSummary(workspace.case),
      generatedAt: nowIso(),
      reviewActions: reviewActions.map(mapReviewAction),
      sourceSpans: parsed.includeSourceSpans
        ? matchingSourceSpans(workspace, reviewActions).map(mapSourceSpan)
        : undefined,
    });
  },

  get_document_updates: async (input, deps) => {
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
  },

  get_operational_signals: async (input, deps) => {
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
  },

  get_actionable_choices: handleActionableChoices,

  get_roi_review_plan: handleActionableChoices,

  get_matter_snapshot: async (input, deps) => {
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
  },

  get_case_action_queue: async (input, deps) => {
    const parsed = murdockMcpInputSchemas.get_case_action_queue.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const tasks = await deps.listCaseActionTasks({
      caseId: workspace.case.id,
      includeDone: parsed.includeDone,
      limit: parsed.limit,
    });

    return getCaseActionQueueOutputSchema.parse({
      case: caseSummary(workspace.case),
      generatedAt: nowIso(),
      tasks: tasks.map(mapCaseActionTask),
    });
  },

  preview_review_transition_plan: async (input, deps) => {
    const parsed = murdockMcpInputSchemas.preview_review_transition_plan.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const actions = parsed.actionRefs.map((actionRef) =>
      resolveReviewAction(workspace, actionRef),
    );

    return previewReviewTransitionPlanOutputSchema.parse({
      case: caseSummary(workspace.case),
      changes: actions.map((action) => ({
        actionRef: reviewWorkItemRef(action),
        blocking: action.blocking,
        currentStatus: action.status,
        nextStatus: statusAfterReviewEvent({
          currentStatus: action.status,
          eventType: parsed.eventType,
        }),
        title: action.title,
      })),
      eventType: parsed.eventType,
      generatedAt: nowIso(),
      warnings: transitionPreviewWarnings({
        actions,
        eventType: parsed.eventType,
      }),
    });
  },

  get_source_span: async (input, deps) => {
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
  },

  search_case_evidence: async (input, deps) => {
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
  },

  record_review_action_event: async (input, deps) => {
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
    const updatedAction = reviewWorkItemSchema.parse({
      ...action,
      resolvedAt: toIso(row.resolved_at),
      status: row.status,
      updatedAt: toIso(row.updated_at),
    });

    return recordReviewActionEventOutputSchema.parse({
      action: mapReviewAction(updatedAction),
      eventType: parsed.eventType,
      generatedAt: nowIso(),
    });
  },

  upsert_case_action_task: async (input, deps) => {
    const parsed = murdockMcpInputSchemas.upsert_case_action_task.parse(input);
    const workspace = await loadWorkspace(parsed, deps);
    const user = await deps.getCurrentUser();
    const task = await deps.upsertCaseActionTask({
      actor: parsed.actor,
      caseId: workspace.case.id,
      connectorHint: parsed.connectorHint,
      createdBy: user.id,
      description: parsed.description,
      kind: parsed.kind,
      priority: parsed.priority,
      provenanceRefs: parsed.provenanceRefs,
      sourceReviewRefs: parsed.sourceReviewRefs,
      sourceSpanRefs: parsed.sourceSpanRefs,
      sourceType: parsed.sourceType,
      status: parsed.status,
      taskKey: parsed.taskKey,
      title: parsed.title,
    });

    return upsertCaseActionTaskOutputSchema.parse({
      generatedAt: nowIso(),
      task: mapCaseActionTask(task),
    });
  },
} satisfies Record<MurdockMcpToolName, McpToolHandler>;
