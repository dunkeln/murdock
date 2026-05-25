import "server-only";

import type { CaseWorkspaceShapeResult } from "@/lib/contracts/case-workspace";
import type { Finding, HarnessBundle } from "@/lib/contracts/harness";
import type { OcrConversionDto } from "@/lib/contracts/ocr-conversions";
import { runHarnessFromConversion } from "@/lib/server/harness/workflows/v1/run";
import { fromHarnessError, safeKey, type ShapeError } from "@/lib/server/workflows/shape/schema";

export type SourceInput = {
  conversion: OcrConversionDto;
  fileName: string;
  sourceKey: string;
};

function value(valueInput: unknown): string | null {
  if (valueInput === null || valueInput === undefined) {
    return null;
  }

  return typeof valueInput === "string" ? valueInput : JSON.stringify(valueInput);
}

function valueType(finding: Finding): CaseWorkspaceShapeResult["facts"][number]["valueType"] {
  if (finding.type === "amount") {
    return "money";
  }
  if (finding.type === "date" || finding.type === "deadline") {
    return "date";
  }
  if (typeof finding.normalizedValue === "boolean") {
    return "boolean";
  }
  if (typeof finding.normalizedValue === "number") {
    return "number";
  }

  return finding.normalizedValue ? "text" : "unknown";
}

function issueType(type: string): CaseWorkspaceShapeResult["issues"][number]["issueType"] {
  if (type.includes("conflict")) {
    return "contradiction";
  }
  if (type.includes("date") || type.includes("deadline")) {
    return "chronology_gap";
  }

  return "missing_context";
}

function severity(
  materiality: Finding["materiality"] | HarnessBundle["conflicts"][number]["materiality"],
): CaseWorkspaceShapeResult["issues"][number]["severity"] {
  if (materiality === "critical" || materiality === "high") {
    return "high";
  }
  if (materiality === "low" || materiality === "informational") {
    return "low";
  }

  return "medium";
}

function project(bundle: HarnessBundle): CaseWorkspaceShapeResult {
  const facts = bundle.findings
    .filter((finding) => ["fact", "timeline_event", "obligation"].includes(finding.kind))
    .map((finding) => ({
      calculatedValue: null,
      category: finding.type,
      categoryDetail: finding.kind,
      confidence: null,
      effectiveAt: null,
      factKey: safeKey("finding", finding.id),
      isCurrent: true,
      label: finding.title,
      normalizedValue: value(finding.normalizedValue),
      observedAt: null,
      sourceSpanKeys: finding.sourceSpans.map((span) => span.id),
      statedValue: finding.originalText,
      valueType: valueType(finding),
    }));
  const findingIssues = bundle.findings
    .filter((finding) => !["fact", "timeline_event", "obligation"].includes(finding.kind))
    .map((finding) => ({
      description: finding.summary,
      issueKey: safeKey("finding", finding.id),
      issueType: issueType(finding.type),
      provenanceSummary: finding.summary,
      relatedEventKeys: [],
      relatedFactKeys: [],
      severity: severity(finding.materiality),
      sourceSpanKeys: finding.sourceSpans.map((span) => span.id),
      status: "open" as const,
      title: finding.title,
    }));
  const conflictIssues = bundle.conflicts.map((conflict) => ({
    description: `Competing values: ${conflict.competingValues
      .map((item) => value(item.value) ?? "null")
      .join(", ")}`,
    issueKey: safeKey("conflict", conflict.id),
    issueType: "contradiction" as const,
    provenanceSummary: `Conflict detected for ${conflict.field}.`,
    relatedEventKeys: [],
    relatedFactKeys: conflict.competingValues.flatMap((item) =>
      item.relatedFindingIds.map((id) => safeKey("finding", id)),
    ),
    severity: severity(conflict.materiality),
    sourceSpanKeys: conflict.competingValues.flatMap((item) =>
      item.sourceSpans.map((span) => span.id),
    ),
    status: "open" as const,
    title: `Conflict: ${conflict.field}`,
  }));
  const issues = [...findingIssues, ...conflictIssues];

  return {
    sourceSpans: bundle.sourceSpans.map((span) => ({
      confidence: null,
      fieldPath: null,
      pageIndex: span.page - 1,
      pageLabel: String(span.page),
      sourceDocumentKey: span.docId,
      spanKey: span.id,
      verbatimExcerpt: span.quote,
    })),
    facts,
    chronologyEvents: [],
    issues,
    controlActions: issues.map((issue) => ({
      actionKey: safeKey("review", issue.issueKey),
      detail: issue.description,
      kind: issue.sourceSpanKeys.length > 0 ? "inspect_provenance" : "review_issue",
      label: "Review",
      relatedIssueKey: issue.issueKey,
      sourceSpanKeys: issue.sourceSpanKeys,
      title: issue.title,
    })),
  };
}

export async function shapeFromOcr(input: {
  caseId: string;
  sources: SourceInput[];
}): Promise<CaseWorkspaceShapeResult | ShapeError> {
  const bundles = [];

  for (const source of input.sources) {
    const result = await runHarnessFromConversion({
      caseId: input.caseId,
      conversion: source.conversion,
      docId: source.sourceKey,
      fileName: source.fileName,
    });

    if (!result.ok) {
      return fromHarnessError(result.error);
    }
    bundles.push(result.bundle);
  }

  return bundles.map(project).reduce<CaseWorkspaceShapeResult>(
    (merged, next) => ({
      controlActions: [...merged.controlActions, ...next.controlActions],
      chronologyEvents: [...merged.chronologyEvents, ...next.chronologyEvents],
      facts: [...merged.facts, ...next.facts],
      issues: [...merged.issues, ...next.issues],
      sourceSpans: [...merged.sourceSpans, ...next.sourceSpans],
    }),
    { controlActions: [], chronologyEvents: [], facts: [], issues: [], sourceSpans: [] },
  );
}
