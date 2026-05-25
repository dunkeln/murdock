import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

import { parseAguiEvents, workspaceControlStateSchema } from "@/lib/agui";
import { caseWorkspaceShapeResultSchema } from "@/lib/contracts/case-workspace";
import { runStarted, stateSnapshot } from "@/lib/server/agui/events";
import { getSourceKey, toShapeError } from "@/lib/server/workflows/workspace-shaping";

const caseId = "11111111-1111-4111-8111-111111111111";

describe("AG-UI control events", () => {
  it("validates lifecycle and state events against AG-UI core schemas", () => {
    const state = workspaceControlStateSchema.parse({
      caseId,
      status: "needs_review",
      summary: {
        sourceCount: 1,
        factCount: 1,
        chronologyEventCount: 1,
        issueCount: 1,
        highSeverityIssueCount: 1,
      },
      actions: [
        {
          id: "issue:1",
          kind: "inspect_provenance",
          label: "Contradiction",
          title: "Review conflicting dates",
          detail: "Inspect the source excerpts.",
          severity: "high",
          issueType: "contradiction",
          relatedIssueId: "66666666-6666-4666-8666-666666666666",
          sourceSpanIds: ["33333333-3333-4333-8333-333333333333"],
        },
      ],
      updatedAt: "2026-02-01T19:20:00.000Z",
    });
    const events = parseAguiEvents([
      runStarted({
        caseId,
        runId: "22222222-2222-4222-8222-222222222222",
        threadId: `case:${caseId}:workspace-control`,
      }),
      stateSnapshot(state),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      EventType.RUN_STARTED,
      EventType.STATE_SNAPSHOT,
    ]);
  });
});

describe("workspace shaping contract", () => {
  it("accepts a narrow source-backed Anthropic extraction shape", () => {
    expect(
      caseWorkspaceShapeResultSchema.safeParse({
        sourceSpans: [
          {
            sourceDocumentKey: getSourceKey(
              "22222222-2222-4222-8222-222222222222",
            ),
            spanKey: "response-deadline",
            pageIndex: 0,
            pageLabel: "1",
            fieldPath: "notice.response_due",
            verbatimExcerpt: "Response must be received by March 14, 2026.",
            confidence: 0.99,
          },
        ],
        facts: [
          {
            factKey: "response-deadline",
            label: "Response deadline",
            category: "deadline",
            categoryDetail: "USCIS notice",
            valueType: "date",
            statedValue: "March 14, 2026",
            normalizedValue: "2026-03-14",
            calculatedValue: null,
            effectiveAt: "2026-03-14T23:59:59.000Z",
            observedAt: "2026-02-01T19:20:00.000Z",
            isCurrent: true,
            confidence: 0.99,
            sourceSpanKeys: ["response-deadline"],
          },
        ],
        chronologyEvents: [],
        issues: [],
        controlActions: [],
      }).success,
    ).toBe(true);
  });

  it("returns a structured missing Anthropic configuration failure", () => {
    expect(toShapeError(new Error("ANTHROPIC_API_KEY is missing"))).toEqual({
      isError: true,
      errorCategory: "configuration",
      isRetryable: false,
      message: "Anthropic is not configured for workspace shaping.",
    });
  });
});
