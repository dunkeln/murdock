import type {
  DocumentRevisionClaimDto,
  RevisionClaimConfidence,
} from "@/lib/contracts/document-revisions";

import type { SnapshotDiff } from "./diff-engine";
import type { RevisionSnapshot } from "./snapshot";

function fallbackLabel(fieldPath: string) {
  return fieldPath
    .split(".")
    .at(-1)!
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function confidenceForDiff(diff: SnapshotDiff): RevisionClaimConfidence {
  if (diff.beforeValue === null || diff.afterValue === null) {
    return "medium";
  }

  return "high";
}

export type RevisionClaimInput = Omit<
  DocumentRevisionClaimDto,
  "createdAt" | "id" | "status" | "updatedAt"
>;

export function mapDiffsToRevisionClaims(input: {
  afterSnapshot: RevisionSnapshot;
  beforeSnapshot: RevisionSnapshot;
  caseId: string;
  diffs: SnapshotDiff[];
  documentFamilyId: string;
  fromDocumentVersionId: string;
  toDocumentVersionId: string;
}): RevisionClaimInput[] {
  return input.diffs.map((diff) => {
    const afterEntry = input.afterSnapshot.entries[diff.fieldPath];
    const beforeEntry = input.beforeSnapshot.entries[diff.fieldPath];

    return {
      afterSourceSpanIds: afterEntry?.sourceSpanIds ?? [],
      afterValue: diff.afterValue,
      beforeSourceSpanIds: beforeEntry?.sourceSpanIds ?? [],
      beforeValue: diff.beforeValue,
      caseId: input.caseId,
      changeType: diff.changeType,
      confidence: confidenceForDiff(diff),
      documentFamilyId: input.documentFamilyId,
      fieldLabel: afterEntry?.label ?? fallbackLabel(diff.fieldPath),
      fieldPath: diff.fieldPath,
      fromDocumentVersionId: input.fromDocumentVersionId,
      toDocumentVersionId: input.toDocumentVersionId,
    };
  });
}
