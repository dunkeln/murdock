import "server-only";

type RawObject = Record<string, unknown>;

const draftAliases = [
  "type",
  "field",
  "category",
  "title",
  "label",
  "name",
  "value",
  "normalizedValue",
  "normalized_value",
  "note",
  "summary",
  "description",
  "sourceSpanIds",
  "source_span_ids",
  "sourceSpans",
  "source_spans",
  "importance",
  "materiality",
  "problem",
  "status",
];
const blockedExtraKeys = [
  "raw",
  "rawOcr",
  "raw_ocr",
  "ocrMarkdown",
  "ocr_markdown",
  "markdown",
  "fullText",
  "full_text",
  "document",
  "documents",
  "providerResponse",
  "provider_response",
  "reasoning",
  "thoughts",
];
const knownDraftKeys = new Set(draftAliases.map(normalizeKey));
const blockedKeys = new Set(blockedExtraKeys.map(normalizeKey));

function normalizeKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function keepExtra(keyName: string) {
  const normalized = normalizeKey(keyName);

  return !knownDraftKeys.has(normalized) && !blockedKeys.has(normalized);
}

function extraValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed ? trimmed.slice(0, 300) : undefined;
  }
  if (Array.isArray(value)) {
    if (depth > 1) {
      return undefined;
    }

    const items = value
      .slice(0, 12)
      .map((item) => extraValue(item, depth + 1))
      .filter((item) => item !== undefined);

    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    if (depth > 1) {
      return undefined;
    }

    const entries = Object.entries(value as RawObject)
      .filter(([keyName]) => keepExtra(keyName))
      .slice(0, 12)
      .flatMap(([keyName, item]) => {
        const next = extraValue(item, depth + 1);

        return next === undefined ? [] : [[keyName, next] as const];
      });

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  return undefined;
}

export function safeExtras(raw: RawObject) {
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([keyName]) => keepExtra(keyName))
      .slice(0, 16)
      .flatMap(([keyName, value]) => {
        const next = extraValue(value);

        return next === undefined ? [] : [[keyName, next] as const];
      }),
  );
}
