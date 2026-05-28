import "server-only";

import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import type { CaseActionTask } from "@/lib/contracts/case-action-tasks";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import type { MatterOperationDto } from "@/lib/contracts/matter-operations";
import type { OperationalSignalDto } from "@/lib/contracts/operational-signals";
import {
  deriveReviewWorkItemCapability,
  type ReviewWorkItem,
} from "@/lib/contracts/review-work-item";
import { reviewWorkItemFromIssue } from "@/lib/review-work-items";
import { MurdockMcpServiceError } from "@/lib/server/mcp/v1/errors";
import {
  opaqueMcpRef,
  issueRef,
  reviewActionRef,
  revisionClaimRef,
  sourceDocumentRef,
  sourceSpanRef,
} from "@/lib/server/mcp/v1/refs";

export function nowIso() {
  return new Date().toISOString();
}

export function caseSummary(caseSummary: CaseWorkspaceDto["case"]) {
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

export function sourceSpanRefs(sourceSpanIds: string[]) {
  return sourceSpanIds.map(sourceSpanRef);
}

export function mapSourceDocument(
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

export function mapSourceSpan(span: CaseWorkspaceDto["sourceSpans"][number]) {
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

export function mapReviewAction(item: ReviewWorkItem) {
  return {
    actionRef: reviewWorkItemRef(item),
    blocking: item.blocking,
    kind: item.kind.family,
    priority: item.priority,
    requiredCapability: deriveReviewWorkItemCapability(item),
    resolvedAt: item.resolvedAt,
    reviewPrompt: item.reviewPrompt,
    sourceSpanCount: item.sourceSpanIds.length,
    sourceSpanRefs: sourceSpanRefs(item.sourceSpanIds),
    status: item.status,
    summary: item.summary,
    title: item.title,
  };
}

export function mapFact(fact: CaseWorkspaceDto["facts"][number]) {
  return {
    calculatedValue: fact.calculatedValue,
    category: fact.category,
    categoryDetail: fact.categoryDetail,
    confidence: fact.confidence,
    effectiveAt: fact.effectiveAt,
    factRef: opaqueMcpRef("fact", fact.id),
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

export function mapChronologyEvent(
  event: CaseWorkspaceDto["chronologyEvents"][number],
) {
  return {
    confidence: event.confidence,
    description: event.description,
    eventKind: event.eventKind,
    eventRef: opaqueMcpRef("event", event.id),
    occurredAt: event.occurredAt,
    occurredAtPrecision: event.occurredAtPrecision,
    sourceSpanCount: event.sourceSpanIds.length,
    sourceSpanRefs: sourceSpanRefs(event.sourceSpanIds),
    title: event.title,
  };
}

export function mapIssue(issue: CaseWorkspaceDto["issues"][number]) {
  return {
    description: issue.description,
    issueRef: issueRef(issue.id),
    issueType: issue.issueType,
    provenanceSummary: issue.provenanceSummary,
    relatedEventRefs: issue.relatedEventIds.map((id) =>
      opaqueMcpRef("event", id),
    ),
    relatedFactRefs: issue.relatedFactIds.map((id) =>
      opaqueMcpRef("fact", id),
    ),
    severity: issue.severity,
    sourceSpanCount: issue.sourceSpanIds.length,
    sourceSpanRefs: sourceSpanRefs(issue.sourceSpanIds),
    status: issue.status,
    title: issue.title,
  };
}

export function mapRevisionSummary(revision: DocumentRevisionSummaryDto) {
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

export function mapOperationalSignal(signal: OperationalSignalDto) {
  return {
    actorType: signal.actorType,
    generatedBy: signal.generatedBy,
    importance: signal.importance,
    observedAt: signal.observedAt,
    occurredAt: signal.occurredAt,
    signalRef: opaqueMcpRef("signal", signal.id),
    signalType: signal.signalType,
    sourceRefCount: signal.sourceRefs.length,
    sourceSpanCount: signal.sourceSpanIds.length,
    state: signal.state,
    summary: signal.summary,
    title: signal.title,
  };
}

export function mapMatterOperation(operation: MatterOperationDto) {
  return {
    blocking: operation.blocking,
    current: operation.current,
    operationRef: opaqueMcpRef("operation", operation.id),
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

export function mapCaseActionTask(task: CaseActionTask) {
  return {
    actor: task.actor,
    connectorHint: task.connectorHint,
    description: task.description,
    kind: task.kind,
    priority: task.priority,
    provenanceRefCount: task.provenanceRefs.length,
    sourceReviewRefs: task.sourceReviewRefs,
    sourceSpanRefs: task.sourceSpanRefs,
    sourceType: task.sourceType,
    status: task.status,
    taskKey: task.taskKey,
    taskRef: opaqueMcpRef("task", task.id),
    title: task.title,
    updatedAt: task.updatedAt,
  };
}

export function openReviewWorkItems(workspace: CaseWorkspaceDto) {
  return workspace.reviewWorkItems.filter((item) => item.status === "open");
}

export function matchingSourceSpans(
  workspace: CaseWorkspaceDto,
  reviewActions: ReviewWorkItem[],
) {
  const sourceSpanIds = new Set(
    reviewActions.flatMap((item) => item.sourceSpanIds),
  );

  return workspace.sourceSpans.filter((span) => sourceSpanIds.has(span.id));
}

export function resolveSourceDocumentId(
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

export function resolveSourceSpan(
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

export function resolveReviewAction(
  workspace: CaseWorkspaceDto,
  actionRef: string,
) {
  const action = workspace.reviewWorkItems.find(
    (candidate) => reviewWorkItemRef(candidate) === actionRef,
  );

  if (action) {
    return action;
  }

  const issue = workspace.issues.find(
    (candidate) => issueRef(candidate.id) === actionRef,
  );

  if (issue) {
    return reviewWorkItemFromIssue(issue);
  }

  throw new MurdockMcpServiceError(
    "not_found",
    "Review work item reference not found for this case.",
    false,
  );
}

export function reviewWorkItemRef(item: ReviewWorkItem) {
  return item.origin.sourceType === "workspace_issue"
    ? issueRef(item.id)
    : reviewActionRef(item.id);
}

export function filteredRevisions(
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

export function toIso(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString();
}
