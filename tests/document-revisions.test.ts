import { describe, expect, it } from "vitest";

import type { CaseWorkspaceRecords } from "@/lib/server/case-workspace/repository";
import { mapDiffsToRevisionClaims } from "@/lib/server/revisions/claims";
import { diffRevisionSnapshots } from "@/lib/server/revisions/diff-engine";
import { serializeRevisionSnapshot } from "@/lib/server/revisions/serialize";
import { buildRevisionSnapshot } from "@/lib/server/revisions/snapshot";

const caseId = "11111111-1111-4111-8111-111111111111";
const sourceDocumentId = "22222222-2222-4222-8222-222222222222";
const sourceSpanId = "33333333-3333-4333-8333-333333333333";
const factId = "44444444-4444-4444-8444-444444444444";
const now = "2026-02-01T19:20:00.000Z";

function makeRecords(value: string): CaseWorkspaceRecords {
  return {
    chronologyEvents: [],
    facts: [
      {
        calculatedValue: null,
        caseId,
        category: "rent",
        categoryDetail: null,
        confidence: 0.98,
        createdAt: now,
        effectiveAt: null,
        factKey: "monthly-rent",
        id: factId,
        isCurrent: true,
        label: "Monthly rent",
        normalizedValue: value,
        observedAt: now,
        sourceSpanIds: [sourceSpanId],
        statedValue: value,
        updatedAt: now,
        valueType: "money",
      },
    ],
    issues: [],
    reviewActions: [],
    sourceDocuments: [
      {
        caseDocumentId: "55555555-5555-4555-8555-555555555555",
        caseId,
        createdAt: now,
        documentSha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        fileName: "lease-v1.pdf",
        id: sourceDocumentId,
        mimeType: "application/pdf",
        ocrConversionId: null,
        ocrStatus: "ready",
        receivedAt: now,
        sizeBytes: 100,
        sourceDate: null,
        sourceKey: "lease-v1",
        sourceKind: "pleading",
        title: "Lease v1",
        updatedAt: now,
      },
    ],
    sourceSpans: [
      {
        capturedAt: now,
        caseId,
        confidence: 0.98,
        createdAt: now,
        fieldPath: "rent.monthly",
        id: sourceSpanId,
        pageIndex: 0,
        pageLabel: "1",
        sourceDocumentId,
        spanKey: "rent",
        updatedAt: now,
        verbatimExcerpt: `Rent is ${value}.`,
      },
    ],
  };
}

function snapshot(value: string) {
  const records = makeRecords(value);

  return buildRevisionSnapshot({
    sourceDocument: records.sourceDocuments[0]!,
    workspace: records,
  });
}

describe("document revisions", () => {
  it("serializes snapshots deterministically", () => {
    const first = serializeRevisionSnapshot(snapshot("$1,500"));
    const second = serializeRevisionSnapshot(snapshot("$1,500"));

    expect(first.snapshotText).toBe(second.snapshotText);
    expect(first.snapshotHash).toBe(second.snapshotHash);
  });

  it("creates one typed revision claim for a changed field", () => {
    const beforeSnapshot = snapshot("$1,500");
    const afterSnapshot = snapshot("$1,700");
    const beforeSerialized = serializeRevisionSnapshot(beforeSnapshot);
    const afterSerialized = serializeRevisionSnapshot(afterSnapshot);
    const diffs = diffRevisionSnapshots({
      afterText: afterSerialized.snapshotText,
      beforeText: beforeSerialized.snapshotText,
    });
    const claims = mapDiffsToRevisionClaims({
      afterSnapshot,
      beforeSnapshot,
      caseId,
      diffs,
      documentFamilyId: "66666666-6666-4666-8666-666666666666",
      fromDocumentVersionId: "77777777-7777-4777-8777-777777777777",
      toDocumentVersionId: "88888888-8888-4888-8888-888888888888",
    });

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      afterSourceSpanIds: [sourceSpanId],
      beforeSourceSpanIds: [sourceSpanId],
      changeType: "changed",
      fieldLabel: "Monthly rent",
      fieldPath: "facts.monthly-rent",
    });
  });

  it("does not report unchanged snapshots", () => {
    const beforeSerialized = serializeRevisionSnapshot(snapshot("$1,500"));
    const afterSerialized = serializeRevisionSnapshot(snapshot("$1,500"));

    expect(
      diffRevisionSnapshots({
        afterText: afterSerialized.snapshotText,
        beforeText: beforeSerialized.snapshotText,
      }),
    ).toEqual([]);
  });
});
