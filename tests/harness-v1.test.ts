import { describe, expect, it } from "vitest";

import { bundleSchema, sourceSpanSchema } from "@/lib/contracts/harness";
import { compileDraft, parseDraft } from "@/lib/server/harness/workflows/v1/draft";
import { mapCandidate } from "@/lib/server/harness/workflows/v1/extract";
import { computeGates } from "@/lib/server/harness/workflows/v1/gates";
import { qualityFindings } from "@/lib/server/harness/workflows/v1/quality";
import { findConflicts } from "@/lib/server/harness/workflows/v1/reconcile";
import { splitSource } from "@/lib/server/harness/workflows/v1/segment";
import { buildSourceMap } from "@/lib/server/harness/workflows/v1/source";

const caseId = "11111111-1111-4111-8111-111111111111";

function source() {
  return buildSourceMap({
    caseId,
    documentSha256:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fileName: "asset-schedule.pdf",
    ocrConversionId: "22222222-2222-4222-8222-222222222222",
    providerModel: "mistral-ocr-latest",
    ocrResult: {
      markdown:
        "Purchase price: $250,000.\n\nClosing deadline: March 14, 2026.",
      model: "mistral-ocr-latest",
      pages: [
        {
          dimensions: null,
          images: [],
          index: 0,
          markdown:
            "Purchase price: $250,000.\n\nClosing deadline: March 14, 2026.",
        },
      ],
      usage: { docSizeBytes: null, pagesProcessed: 1 },
    },
  });
}

describe("harness v1", () => {
  it("builds a source map from OCR without semantic wrapping", () => {
    const map = source();

    expect(map.docs[0]).toMatchObject({
      caseId,
      fileName: "asset-schedule.pdf",
      pageCount: 1,
    });
    expect(map.sourceSpans).toHaveLength(2);
    expect(map.sourceSpans[0]).toMatchObject({
      page: 1,
      quote: "Purchase price: $250,000.",
    });
  });

  it("uses provider-native OCR confidence scale", () => {
    expect(
      sourceSpanSchema.parse({
        id: "span-1",
        docId: "doc-1",
        page: 1,
        charStart: 0,
        charEnd: 5,
        quote: "Hello",
        ocrConfidence: 91,
      }).ocrConfidence,
    ).toBe(91);
    expect(() =>
      sourceSpanSchema.parse({
        id: "span-1",
        docId: "doc-1",
        page: 1,
        charStart: 0,
        charEnd: 5,
        quote: "Hello",
        ocrConfidence: 101,
      }),
    ).toThrow();
  });

  it("segments source spans by budget pressure", () => {
    const segments = splitSource(source(), {
      maxChars: 35,
      maxNumbers: 10,
      maxPages: 5,
      maxSpans: 80,
      maxTableCells: 150,
    });

    expect(segments).toHaveLength(2);
    expect(segments[0]?.spans).toHaveLength(1);
  });

  it("parses simple camelCase and snake_case drafts", () => {
    expect(
      parseDraft({
        type: "deadline",
        title: "Response deadline",
        value: "2026-04-01",
        sourceSpanIds: ["span-1"],
        importance: "high",
      }),
    ).toMatchObject({
      type: "deadline",
      title: "Response deadline",
      sourceSpanIds: ["span-1"],
      importance: "high",
      problem: null,
    });
    expect(
      parseDraft({
        type: "requires_external_law",
        title: "Legal standard",
        source_span_ids: ["span-2"],
        materiality: "critical",
        status: "external_law",
      }),
    ).toMatchObject({
      importance: "critical",
      problem: "external_law",
      sourceSpanIds: ["span-2"],
    });
  });

  it("compiles drafts into findings and gates unsupported material claims", () => {
    const map = source();
    const segment = splitSource(map)[0]!;
    const [span] = segment.spans;
    const findings = mapCandidate({
      doc: map.docs[0]!,
      segment,
      candidate: {
        drafts: [
          {
            type: "amount",
            title: "Purchase price",
            value: 250000,
            note: "The purchase price is $250,000.",
            sourceSpanIds: [span!.id],
            importance: "high",
          },
          {
            type: "deadline",
            title: "Response deadline",
            value: "2026-04-01",
            note: "A response deadline exists.",
            sourceSpanIds: [],
            importance: "high",
          },
        ],
      },
    });
    const gates = computeGates({ conflicts: [], findings });

    expect(findings[0]?.status).toBe("confirmed");
    expect(findings[1]?.status).toBe("unsupported");
    expect(gates.find((gate) => gate.targetId === findings[1]?.id)).toMatchObject({
      level: "G3_hard_gate",
      reasonCodes: ["no_source"],
    });
  });

  it("compiles external law drafts into out-of-scope findings", () => {
    const map = source();
    const segment = splitSource(map)[0]!;
    const finding = compileDraft({
      doc: map.docs[0]!,
      index: 0,
      segment,
      raw: {
        type: "requires_external_law",
        title: "Determine controlling law",
        note: "This requires legal analysis outside the OCR bundle.",
        sourceSpanIds: [segment.spans[0]!.id],
        importance: "critical",
        problem: "external_law",
      },
    });

    expect(finding).toMatchObject({
      kind: "out_of_scope",
      status: "out_of_scope",
      materiality: "critical",
    });
  });

  it("preserves conflicts as first-class objects", () => {
    const map = source();
    const segment = splitSource(map)[0]!;
    const [span] = segment.spans;
    const findings = mapCandidate({
      doc: map.docs[0]!,
      segment,
      candidate: {
        drafts: [250000, 275000].map((amount) => ({
          type: "amount",
          title: "Purchase price",
          value: amount,
          note: `The purchase price is ${amount}.`,
          sourceSpanIds: [span!.id],
          importance: "high" as const,
        })),
      },
    });
    const conflicts = findConflicts(findings);
    const gates = computeGates({ conflicts, findings });

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      type: "amount_conflict",
      status: "unresolved",
    });
    expect(gates.find((gate) => gate.targetId === conflicts[0]?.id)).toMatchObject({
      level: "G3_hard_gate",
      blocking: true,
    });
  });

  it("parses the UI-ready bundle contract", () => {
    const map = source();
    const findings = qualityFindings(map);

    expect(() =>
      bundleSchema.parse({
        version: "harness.v1",
        docs: map.docs,
        sourceSpans: map.sourceSpans,
        findings,
        conflicts: [],
        gates: computeGates({ conflicts: [], findings }),
        resolutions: [],
        stats: {
          conflictCount: 0,
          docCount: 1,
          findingCount: findings.length,
          gateCount: findings.length,
          spanCount: map.sourceSpans.length,
        },
      }),
    ).not.toThrow();
  });
});
