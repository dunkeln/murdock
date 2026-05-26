import { createHash } from "node:crypto";

import type { RevisionSnapshot, RevisionSnapshotEntry } from "./snapshot";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function stableValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }

  return null;
}

export function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function serializeRevisionSnapshot(snapshot: RevisionSnapshot) {
  const lines = Object.entries(snapshot.entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, entry]) => `${path}\t${stableJson(entry.value)}`);
  const snapshotText = lines.length > 0 ? lines.join("\n") : "snapshot.empty\tnull";

  return {
    snapshotJson: stableValue(snapshot) as Record<string, unknown>,
    snapshotText,
    snapshotHash: createHash("sha256").update(snapshotText).digest("hex"),
  };
}

export function parseSnapshotLine(line: string):
  | {
      fieldPath: string;
      value: unknown;
    }
  | null {
  const separatorIndex = line.indexOf("\t");

  if (separatorIndex < 1) {
    return null;
  }

  try {
    return {
      fieldPath: line.slice(0, separatorIndex),
      value: JSON.parse(line.slice(separatorIndex + 1)),
    };
  } catch {
    return null;
  }
}

export function entryByPath(snapshot: RevisionSnapshot) {
  return new Map<string, RevisionSnapshotEntry>(Object.entries(snapshot.entries));
}
