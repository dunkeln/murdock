import { diffLines } from "diff";

import type { RevisionChangeType } from "@/lib/contracts/document-revisions";

import { parseSnapshotLine } from "./serialize";

export type SnapshotDiff = {
  afterValue: unknown | null;
  beforeValue: unknown | null;
  changeType: RevisionChangeType;
  fieldPath: string;
};

function changedLines(input: { beforeText: string; afterText: string }) {
  const removed = new Map<string, unknown>();
  const added = new Map<string, unknown>();

  for (const part of diffLines(input.beforeText, input.afterText)) {
    if (!part.added && !part.removed) {
      continue;
    }

    for (const line of part.value.split("\n").filter(Boolean)) {
      const parsed = parseSnapshotLine(line);

      if (!parsed) {
        continue;
      }

      if (part.added) {
        added.set(parsed.fieldPath, parsed.value);
      } else if (part.removed) {
        removed.set(parsed.fieldPath, parsed.value);
      }
    }
  }

  return { added, removed };
}

export function diffRevisionSnapshots(input: {
  afterText: string;
  beforeText: string;
}): SnapshotDiff[] {
  const { added, removed } = changedLines(input);
  const paths = [...new Set([...added.keys(), ...removed.keys()])].sort((left, right) =>
    left.localeCompare(right),
  );

  return paths.map((fieldPath) => {
    const beforeValue = removed.get(fieldPath) ?? null;
    const afterValue = added.get(fieldPath) ?? null;
    const changeType: RevisionChangeType =
      beforeValue === null ? "added" : afterValue === null ? "removed" : "changed";

    return {
      afterValue,
      beforeValue,
      changeType,
      fieldPath,
    };
  }).filter((diff) => diff.fieldPath !== "snapshot.empty");
}
