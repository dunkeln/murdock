import "server-only";

import type { CaseWorkspaceShapeResult } from "@/lib/contracts/case-workspace";
import type { Finding, HarnessBundle } from "@/lib/contracts/harness";
import type { OcrConversionDto } from "@/lib/contracts/ocr-conversions";
import {
  type HarnessRunObserver,
  runHarnessFromConversion,
} from "@/lib/server/harness/workflows/v1/run";
import { fromHarnessError, safeKey, type ShapeError } from "@/lib/server/workflows/shape/schema";

export type SourceInput = {
  caseDocumentId?: string | null;
  conversion: OcrConversionDto;
  fileName: string;
  sourceKey: string;
};

export type HarnessBundleResult = {
  bundle: HarnessBundle;
  model: string;
  provider: string;
  source: SourceInput;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

export type ShapeFromOcrResult =
  | {
      bundles: HarnessBundleResult[];
      shape: CaseWorkspaceShapeResult;
    }
  | ShapeError;

const DEFAULT_MAX_SOURCE_CALLS = 2;

function maxSourceCalls() {
  const parsed = Number.parseInt(process.env.HARNESS_MAX_SOURCE_CALLS ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_SOURCE_CALLS;
}

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

async function runSourceHarness(input: {
  caseId: string;
  index: number;
  observerForSource?: (source: SourceInput, index: number) => HarnessRunObserver;
  source: SourceInput;
}): Promise<HarnessBundleResult | ShapeError> {
  const result = await runHarnessFromConversion({
    caseId: input.caseId,
    conversion: input.source.conversion,
    docId: input.source.sourceKey,
    fileName: input.source.fileName,
    observer: input.observerForSource?.(input.source, input.index),
  });

  if (!result.ok) {
    return fromHarnessError(result.error);
  }

  return {
    bundle: result.bundle,
    model: result.model,
    provider: result.provider,
    source: input.source,
    usage: result.usage,
  };
}

async function runSourceHarnesses(input: {
  caseId: string;
  observerForSource?: (source: SourceInput, index: number) => HarnessRunObserver;
  sources: SourceInput[];
}): Promise<HarnessBundleResult[] | ShapeError> {
  const results: Array<HarnessBundleResult | undefined> = [];
  let firstError: ShapeError | null = null;
  let nextIndex = 0;
  const workerCount = Math.min(maxSourceCalls(), input.sources.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (!firstError) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= input.sources.length) {
        return;
      }

      const source = input.sources[index]!;
      const result = await runSourceHarness({
        caseId: input.caseId,
        index,
        observerForSource: input.observerForSource,
        source,
      });

      if ("isError" in result) {
        firstError = result;
        return;
      }

      results[index] = result;
    }
  });

  await Promise.all(workers);

  return firstError
    ? firstError
    : results.filter((result): result is HarnessBundleResult => Boolean(result));
}

export async function shapeFromOcr(input: {
  caseId: string;
  observerForSource?: (source: SourceInput, index: number) => HarnessRunObserver;
  sources: SourceInput[];
}): Promise<ShapeFromOcrResult> {
  const bundles = await runSourceHarnesses(input);

  if ("isError" in bundles) {
    return bundles;
  }

  return {
    bundles,
    shape: bundles.map((result) => project(result.bundle)).reduce<CaseWorkspaceShapeResult>(
      (merged, next) => ({
        controlActions: [...merged.controlActions, ...next.controlActions],
        chronologyEvents: [...merged.chronologyEvents, ...next.chronologyEvents],
        facts: [...merged.facts, ...next.facts],
        issues: [...merged.issues, ...next.issues],
        sourceSpans: [...merged.sourceSpans, ...next.sourceSpans],
      }),
      { controlActions: [], chronologyEvents: [], facts: [], issues: [], sourceSpans: [] },
    ),
  };
}
