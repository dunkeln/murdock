import "server-only";

import {
  type Finding,
  type FindingDraft,
  type HarnessDoc,
  findingDraftSchema,
  findingSchema,
} from "@/lib/contracts/harness";
import { safeExtras } from "@/lib/server/harness/workflows/v1/extras";
import { id, key } from "@/lib/server/harness/workflows/v1/ids";
import type { Segment } from "@/lib/server/harness/workflows/v1/segment";

export type RawDraft = Record<string, unknown>;

const importance = new Set(["critical", "high", "medium", "low", "info"]);
const problems = new Set([
  "missing",
  "unclear",
  "conflict",
  "unsupported",
  "external_law",
]);

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function prop(raw: RawDraft, ...names: string[]) {
  for (const name of names) {
    if (raw[name] !== undefined) {
      return raw[name];
    }
  }

  return undefined;
}

function choice(value: unknown, allowed: Set<string>) {
  const normalized = text(value)?.toLowerCase();

  return normalized && allowed.has(normalized) ? normalized : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === "string") {
      return item ? [item] : [];
    }
    if (item && typeof item === "object") {
      const spanId = prop(item as RawDraft, "id", "spanId", "sourceSpanId");

      return typeof spanId === "string" && spanId ? [spanId] : [];
    }

    return [];
  });
}

function scalar(value: unknown): FindingDraft["value"] {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return null;
}

export function parseDraft(raw: RawDraft): FindingDraft {
  return findingDraftSchema.parse({
    type: text(prop(raw, "type", "field", "category")) ?? "other",
    title: text(prop(raw, "title", "label", "name")) ?? "Finding",
    value: scalar(prop(raw, "value", "normalizedValue", "normalized_value")),
    note: text(prop(raw, "note", "summary", "description")),
    sourceSpanIds: strings(
      prop(raw, "sourceSpanIds", "source_span_ids", "sourceSpans", "source_spans"),
    ),
    importance: choice(prop(raw, "importance", "materiality"), importance) ?? "medium",
    problem: choice(prop(raw, "problem", "status"), problems),
    extras: safeExtras(raw),
  });
}

function kind(draft: FindingDraft): Finding["kind"] {
  if (draft.problem === "external_law") {
    return "out_of_scope";
  }
  if (draft.problem === "missing" || draft.type.startsWith("missing_")) {
    return "missing_info";
  }
  if (draft.type === "obligation") {
    return "obligation";
  }
  if (draft.type === "event" || draft.type === "date" || draft.type === "deadline") {
    return "timeline_event";
  }
  if (draft.type.includes("signature")) {
    return "signature_gap";
  }
  if (draft.type.includes("ocr") || draft.type.includes("quality")) {
    return "document_quality";
  }

  return draft.problem ? "issue" : "fact";
}

function status(draft: FindingDraft): Finding["status"] {
  if (draft.problem === "external_law") {
    return "out_of_scope";
  }
  if (draft.problem === "conflict") {
    return "conflicting";
  }
  if (draft.problem === "missing") {
    return "missing";
  }
  if (draft.problem === "unclear") {
    return "unclear";
  }
  if (draft.problem === "unsupported") {
    return "unsupported";
  }

  return "confirmed";
}

function materiality(draft: FindingDraft): Finding["materiality"] {
  return draft.importance === "info" ? "informational" : draft.importance;
}

function ocrQuality(spans: Finding["sourceSpans"]) {
  const scores = spans.flatMap((span) =>
    span.ocrConfidence === null ? [] : [span.ocrConfidence],
  );

  if (scores.length === 0) {
    return "mixed";
  }

  const lowest = Math.min(...scores);

  return lowest < 60 ? "poor" : lowest < 85 ? "mixed" : "good";
}

function serious(value: Finding["materiality"]) {
  return value === "critical" || value === "high";
}

export function compileDraft(input: {
  doc: HarnessDoc;
  index: number;
  raw: RawDraft;
  segment: Segment;
}): Finding {
  const draft = parseDraft(input.raw);
  const spanById = new Map(input.segment.spans.map((span) => [span.id, span]));
  const sourceSpans = draft.sourceSpanIds.flatMap((spanId) => {
    const span = spanById.get(spanId);

    return span ? [span] : [];
  });
  const baseStatus = status(draft);
  const level = materiality(draft);
  const finalStatus =
    sourceSpans.length === 0 && baseStatus === "confirmed" && serious(level)
      ? "unsupported"
      : baseStatus;
  const supported = sourceSpans.length > 0;
  const evidenceQuality = supported ? (draft.problem ? "partial" : "strong") : "none";

  return findingSchema.parse({
    id: id([input.doc.id, input.index, key(draft.type), key(draft.title)]),
    kind: kind(draft),
    type: key(draft.type) || "other",
    title: draft.title,
    summary: draft.note ?? draft.title,
    normalizedValue: draft.value,
    originalText:
      typeof draft.value === "string" ? draft.value : sourceSpans[0]?.quote ?? null,
    sourceSpans,
    status: finalStatus,
    materiality: level,
    evidenceQuality,
    confidenceBasis: {
      ambiguity: draft.problem ? "material" : "none",
      ocrQuality: ocrQuality(sourceSpans),
      sourceQuality: evidenceQuality,
    },
    unresolvedQuestions: draft.problem && draft.note ? [draft.note] : [],
  });
}
