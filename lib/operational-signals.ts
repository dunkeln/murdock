import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import {
  type OperationalSignalDto,
  operationalSignalDtoSchema,
} from "@/lib/contracts/operational-signals";
import type {
  CaseReviewActionDto,
  ReviewActionPriority,
} from "@/lib/contracts/review-reducer";

type BuildOperationalSignalsInput = {
  documentRevisions: DocumentRevisionSummaryDto[];
  workspace: CaseWorkspaceDto;
};

function asString(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "empty";
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

function trimSummary(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function priorityToImportance(
  action: CaseReviewActionDto,
): OperationalSignalDto["importance"] {
  if (action.blocking) {
    return "blocking";
  }

  const map: Record<ReviewActionPriority, OperationalSignalDto["importance"]> = {
    critical: "high",
    high: "high",
    low: "low",
    medium: "medium",
  };

  return map[action.priority];
}

function reviewActionSignalType(
  action: CaseReviewActionDto,
): OperationalSignalDto["signalType"] {
  if (action.status === "resolved") {
    return "review_action_resolved";
  }

  if (action.status === "dismissed") {
    return "review_action_dismissed";
  }

  return "review_action_opened";
}

function reviewActionState(
  action: CaseReviewActionDto,
): OperationalSignalDto["state"] {
  if (action.status === "resolved") {
    return "resolved";
  }

  if (action.status === "dismissed") {
    return "dismissed";
  }

  return "active";
}

function sortSignals(signals: OperationalSignalDto[]) {
  return [...signals].sort(
    (left, right) =>
      right.observedAt.localeCompare(left.observedAt) ||
      left.id.localeCompare(right.id),
  );
}

export function buildOperationalSignals(
  input: BuildOperationalSignalsInput,
): OperationalSignalDto[] {
  const documentSignals = input.workspace.sourceDocuments.map((document) =>
    operationalSignalDtoSchema.parse({
      actorId: null,
      actorType: "system",
      caseId: input.workspace.case.id,
      generatedBy: "document_ingestion",
      id: `source-document:${document.id}:added`,
      importance: "medium",
      observedAt: document.createdAt,
      occurredAt: document.receivedAt ?? document.sourceDate,
      signalType: "document_added",
      sourceRefs: [
        {
          id: document.id,
          kind: "source_document",
          label: document.title,
        },
      ],
      sourceSpanIds: [],
      state: "informational",
      summary: `Document available in the case workspace: ${document.fileName}.`,
      title: `Document added: ${document.title}`,
    }),
  );

  const revisionSignals = input.documentRevisions.flatMap((revision) =>
    revision.claims.map((claim) =>
      operationalSignalDtoSchema.parse({
        actorId: null,
        actorType: "system",
        caseId: claim.caseId,
        generatedBy: "document_revision",
        id: `revision-claim:${claim.id}:${claim.status}`,
        importance: claim.confidence === "high" ? "medium" : "low",
        observedAt: claim.updatedAt,
        occurredAt: null,
        signalType: "document_changed",
        sourceRefs: [
          {
            id: claim.id,
            kind: "revision_claim",
            label: claim.fieldLabel,
          },
          {
            id: revision.fromSourceDocumentId,
            kind: "source_document",
            label: revision.fromVersionLabel,
          },
          {
            id: revision.toSourceDocumentId,
            kind: "source_document",
            label: revision.toVersionLabel,
          },
        ],
        sourceSpanIds: [
          ...new Set([
            ...claim.beforeSourceSpanIds,
            ...claim.afterSourceSpanIds,
          ]),
        ],
        state: claim.status === "dismissed" ? "dismissed" : "informational",
        summary: trimSummary(
          `${revision.documentLabel} changed from ${revision.fromVersionLabel} to ${revision.toVersionLabel}: ${claim.fieldLabel} ${claim.changeType} from ${asString(claim.beforeValue)} to ${asString(claim.afterValue)}.`,
        ),
        title: `Document update: ${claim.fieldLabel}`,
      }),
    ),
  );

  const reviewSignals = input.workspace.reviewActions.map((action) =>
    operationalSignalDtoSchema.parse({
      actorId: null,
      actorType: "system",
      caseId: action.caseId,
      generatedBy: "review_reducer",
      id: `review-action:${action.id}:${action.status}`,
      importance: priorityToImportance(action),
      observedAt: action.resolvedAt ?? action.updatedAt,
      occurredAt: null,
      signalType: reviewActionSignalType(action),
      sourceRefs: [
        {
          id: action.id,
          kind: "review_action",
          label: action.title,
        },
        ...action.sourceSpanIds.map((sourceSpanId) => ({
          id: sourceSpanId,
          kind: "source_span" as const,
          label: null,
        })),
        ...action.rawRefs.map((rawRef) => ({
          id: rawRef.id,
          kind: rawRef.kind === "revision_claim" ? "revision_claim" : "raw_ref",
          label: rawRef.label,
        })),
      ],
      sourceSpanIds: action.sourceSpanIds,
      state: reviewActionState(action),
      summary: trimSummary(`${action.actionLabel}: ${action.summary}`),
      title: action.title,
    }),
  );

  return sortSignals([...documentSignals, ...revisionSignals, ...reviewSignals]);
}
