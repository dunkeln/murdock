import "server-only";

import {
  type Conflict,
  type Finding,
  conflictSchema,
} from "@/lib/contracts/harness";
import { id, key } from "@/lib/server/harness/workflows/v1/ids";

const comparable = new Set([
  "party",
  "date",
  "deadline",
  "amount",
  "signature",
  "obligation",
  "defined_term",
]);

const rank = {
  informational: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
} as const;

function conflictType(type: string): Conflict["type"] {
  if (type === "party") {
    return "party_identity_conflict";
  }
  if (type === "date") {
    return "date_conflict";
  }
  if (type === "deadline") {
    return "deadline_conflict";
  }
  if (type === "amount") {
    return "amount_conflict";
  }
  if (type === "obligation") {
    return "obligation_conflict";
  }
  if (type === "defined_term") {
    return "defined_term_conflict";
  }

  return "other";
}

function valueOf(finding: Finding) {
  return finding.normalizedValue ?? finding.originalText;
}

function materiality(findings: Finding[]): Conflict["materiality"] {
  const highest = findings.reduce((current, finding) => {
    return rank[finding.materiality] > rank[current] ? finding.materiality : current;
  }, "low" as Finding["materiality"]);

  return highest === "informational" ? "low" : highest;
}

export function findConflicts(findings: Finding[]): Conflict[] {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    if (!comparable.has(finding.type) || valueOf(finding) === null) {
      continue;
    }

    const groupKey = `${finding.type}:${key(finding.title)}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), finding]);
  }

  return [...groups.entries()].flatMap(([groupKey, groupFindings]) => {
    const byValue = new Map<string, Finding[]>();

    for (const finding of groupFindings) {
      byValue.set(String(valueOf(finding)), [
        ...(byValue.get(String(valueOf(finding))) ?? []),
        finding,
      ]);
    }

    if (byValue.size < 2) {
      return [];
    }

    const [type, field] = groupKey.split(":");

    return [
      conflictSchema.parse({
        id: id(["conflict", groupKey, [...byValue.keys()].join("|")]),
        type: conflictType(type ?? "other"),
        field: field || groupKey,
        competingValues: [...byValue.entries()].map(([value, matches]) => ({
          value,
          sourceSpans: matches.flatMap((finding) => finding.sourceSpans),
          relatedFindingIds: matches.map((finding) => finding.id),
        })),
        materiality: materiality(groupFindings),
        status: "unresolved",
      }),
    ];
  });
}
