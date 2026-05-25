import "server-only";

import type { CaseWorkspaceShapeResult } from "@/lib/contracts/case-workspace";
import {
  getCaseWorkspaceRecordsByCaseId,
  upsertCaseWorkspaceChronologyEvents,
  upsertCaseWorkspaceFacts,
  upsertCaseWorkspaceIssues,
  upsertCaseWorkspaceSourceDocuments,
  upsertCaseWorkspaceSourceSpans,
} from "@/lib/server/case-workspace/repository";
import type { SourceInput } from "@/lib/server/workflows/shape/project";
import { safeKey } from "@/lib/server/workflows/shape/schema";

export async function persistShape(input: {
  caseId: string;
  shape: CaseWorkspaceShapeResult;
  sources: SourceInput[];
}) {
  const docs = await upsertCaseWorkspaceSourceDocuments(
    input.sources.map((source) => ({
      caseDocumentId: source.caseDocumentId ?? null,
      caseId: input.caseId,
      documentSha256: source.conversion.documentSha256,
      fileName: source.fileName,
      ocrConversionId: source.conversion.id,
      ocrStatus: source.conversion.status,
      receivedAt: source.conversion.updatedAt,
      sourceDate: null,
      sourceKey: source.sourceKey,
      sourceKind: "other",
      title: source.fileName,
    })),
  );
  const docByKey = new Map(docs.map((doc) => [doc.sourceKey, doc]));
  const spans = await upsertCaseWorkspaceSourceSpans(
    input.shape.sourceSpans.flatMap((span) => {
      const doc = docByKey.get(span.sourceDocumentKey);

      return doc
        ? [
            {
              caseId: input.caseId,
              confidence: span.confidence,
              fieldPath: span.fieldPath,
              pageIndex: span.pageIndex,
              pageLabel: span.pageLabel,
              sourceDocumentId: doc.id,
              spanKey: safeKey(span.sourceDocumentKey, span.spanKey),
              verbatimExcerpt: span.verbatimExcerpt,
            },
          ]
        : [];
    }),
  );
  const spanByKey = new Map(
    input.shape.sourceSpans.flatMap((shapeSpan) => {
      const row = spans.find((span) => {
        return span.spanKey === safeKey(shapeSpan.sourceDocumentKey, shapeSpan.spanKey);
      });

      return row ? [[shapeSpan.spanKey, row]] : [];
    }),
  );
  const getSpanIds = (keys: string[]) =>
    keys.flatMap((key) => {
      const span = spanByKey.get(key);

      return span ? [span.id] : [];
    });
  const facts = await upsertCaseWorkspaceFacts(
    input.shape.facts.map((fact) => ({
      ...fact,
      caseId: input.caseId,
      sourceSpanIds: getSpanIds(fact.sourceSpanKeys),
    })),
  );
  const events = await upsertCaseWorkspaceChronologyEvents(
    input.shape.chronologyEvents.map((event) => ({
      ...event,
      caseId: input.caseId,
      sourceSpanIds: getSpanIds(event.sourceSpanKeys),
    })),
  );
  const factByKey = new Map(facts.map((fact) => [fact.factKey, fact]));
  const eventByKey = new Map(events.map((event) => [event.eventKey, event]));

  await upsertCaseWorkspaceIssues(
    input.shape.issues.map((issue) => ({
      caseId: input.caseId,
      description: issue.description,
      issueKey: issue.issueKey,
      issueType: issue.issueType,
      provenanceSummary: issue.provenanceSummary,
      relatedEventIds: issue.relatedEventKeys.flatMap((key) => {
        const event = eventByKey.get(key);

        return event ? [event.id] : [];
      }),
      relatedFactIds: issue.relatedFactKeys.flatMap((key) => {
        const fact = factByKey.get(key);

        return fact ? [fact.id] : [];
      }),
      severity: issue.severity,
      sourceSpanIds: getSpanIds(issue.sourceSpanKeys),
      status: issue.status,
      title: issue.title,
    })),
  );

  return getCaseWorkspaceRecordsByCaseId({ caseId: input.caseId });
}
