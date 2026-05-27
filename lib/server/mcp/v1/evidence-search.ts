import "server-only";

import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import { buildOperationalSignals } from "@/lib/operational-signals";
import {
  sourceDocumentRef,
  sourceSpanRef,
} from "@/lib/server/mcp/v1/refs";
import { sourceSpanRefs } from "@/lib/server/mcp/v1/projections";

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

export function evidenceMatches(input: {
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
    ...input.workspace.reviewWorkItems.map((action) => ({
      documentRef: null,
      fieldPath: null,
      kind: "review_action" as const,
      label: action.title,
      sourceSpanRefs: sourceSpanRefs(action.sourceSpanIds),
      text: [
        action.title,
        action.summary,
        action.reviewPrompt,
        action.kind.family,
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
    .sort(
      (left, right) =>
        right.score - left.score || left.label.localeCompare(right.label),
    )
    .slice(0, input.limit);
}
