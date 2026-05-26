import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import {
  MURDOCK_MCP_VERSION,
  type MurdockMcpToolName,
} from "@/lib/contracts/mcp";
import {
  type CaseWorkspaceDto,
  caseWorkspaceDtoSchema,
} from "@/lib/contracts/case-workspace";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import {
  executeMurdockMcpV1Tool,
  getMurdockMcpV1ToolDescriptors,
  handleMurdockMcpV1JsonRpc,
} from "@/lib/server/mcp/v1";

const now = "2026-02-01T19:20:00.000Z";
const caseId = "11111111-1111-4111-8111-111111111111";
const sourceDocumentId = "22222222-2222-4222-8222-222222222222";
const sourceSpanId = "33333333-3333-4333-8333-333333333333";
const reviewActionId = "44444444-4444-4444-8444-444444444444";
const reducerRunId = "55555555-5555-4555-8555-555555555555";
const revisionClaimId = "66666666-6666-4666-8666-666666666666";
const documentFamilyId = "77777777-7777-4777-8777-777777777777";
const fromVersionId = "88888888-8888-4888-8888-888888888888";
const toVersionId = "99999999-9999-4999-8999-999999999999";

function opaqueRef(prefix: string, id: string) {
  const digest = createHash("sha256")
    .update(`murdock-mcp.v1:${prefix}:${id}`)
    .digest("hex")
    .slice(0, 16);

  return `${prefix}_${digest}`;
}

function expectNoInternalIds(value: unknown) {
  const serialized = JSON.stringify(value);

  for (const id of [
    caseId,
    sourceDocumentId,
    sourceSpanId,
    reviewActionId,
    reducerRunId,
    revisionClaimId,
    documentFamilyId,
    fromVersionId,
    toVersionId,
  ]) {
    expect(serialized).not.toContain(id);
  }
  expect(serialized).not.toContain("rawRefs");
  expect(serialized).not.toContain("reducerRunId");
  expect(serialized).not.toContain("sourceSpanIds");
}

function makeWorkspace(overrides: Partial<CaseWorkspaceDto> = {}) {
  return caseWorkspaceDtoSchema.parse({
    case: {
      clientName: "Example client",
      id: caseId,
      nextAction: null,
      nextDeadlineAt: null,
      priority: "normal",
      slug: "example-case",
      title: "Example Case",
      type: "general",
      updatedAt: now,
    },
    chronologyEvents: [],
    facts: [
      {
        calculatedValue: null,
        caseId,
        category: "party",
        categoryDetail: null,
        confidence: 0.9,
        createdAt: now,
        effectiveAt: null,
        factKey: "plaintiff-name",
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        isCurrent: true,
        label: "Plaintiff name",
        normalizedValue: "Acme LLC",
        observedAt: now,
        sourceSpanIds: [sourceSpanId],
        statedValue: "Acme LLC",
        updatedAt: now,
        valueType: "text",
      },
    ],
    generatedAt: now,
    issues: [],
    reviewActions: [
      {
        actionKey: "review-action-notice-service",
        actionLabel: "Review notice",
        assignedRole: "paralegal",
        blocking: true,
        caseId,
        createdAt: now,
        id: reviewActionId,
        kind: "missing",
        priority: "high",
        rawRefs: [
          {
            id: "notice-service-missing",
            key: "notice-service-missing",
            kind: "harness_finding",
            label: "Notice service method missing",
            runId: null,
            sourceKey: "ud-100",
          },
        ],
        reducerRunId,
        resolvedAt: null,
        sourceSpanIds: [sourceSpanId],
        status: "open",
        summary: "Item 10 does not select a notice service method.",
        title: "Notice service method not selected",
        updatedAt: now,
      },
      {
        actionKey: "resolved-action",
        actionLabel: "Done",
        assignedRole: "paralegal",
        blocking: false,
        caseId,
        createdAt: now,
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        kind: "source_check",
        priority: "low",
        rawRefs: [
          {
            id: "old",
            key: "old",
            kind: "workspace_issue",
            label: "Old item",
            runId: null,
            sourceKey: null,
          },
        ],
        reducerRunId,
        resolvedAt: now,
        sourceSpanIds: [],
        status: "resolved",
        summary: "Resolved already.",
        title: "Resolved item",
        updatedAt: now,
      },
    ],
    sourceDocuments: [
      {
        caseDocumentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        caseId,
        createdAt: now,
        documentSha256: null,
        fileName: "ud-100.pdf",
        id: sourceDocumentId,
        mimeType: "application/pdf",
        ocrConversionId: null,
        ocrStatus: "ready",
        receivedAt: now,
        sizeBytes: 1234,
        sourceDate: null,
        sourceKey: "ud-100",
        sourceKind: "pleading",
        title: "UD-100 complaint",
        updatedAt: now,
      },
    ],
    sourceSpans: [
      {
        capturedAt: now,
        caseId,
        confidence: 0.92,
        createdAt: now,
        fieldPath: "notice.service_method",
        id: sourceSpanId,
        pageIndex: 0,
        pageLabel: "1",
        sourceDocumentId,
        spanKey: "notice-service",
        updatedAt: now,
        verbatimExcerpt: "Notice service method is not selected.",
      },
    ],
    ...overrides,
  });
}

function makeRevisionSummaries(): DocumentRevisionSummaryDto[] {
  return [
    {
      claims: [
        {
          afterSourceSpanIds: [sourceSpanId],
          afterValue: "Acme LLC",
          beforeSourceSpanIds: [],
          beforeValue: null,
          caseId,
          changeType: "added",
          confidence: "high",
          createdAt: now,
          documentFamilyId,
          fieldLabel: "Plaintiff name",
          fieldPath: "facts.plaintiff_name",
          fromDocumentVersionId: fromVersionId,
          id: revisionClaimId,
          status: "confirmed",
          toDocumentVersionId: toVersionId,
          updatedAt: now,
        },
      ],
      documentFamilyId,
      documentLabel: "Complaint",
      fromSourceDocumentId: sourceDocumentId,
      fromVersionLabel: "v1",
      toSourceDocumentId: sourceDocumentId,
      toVersionLabel: "v2",
    },
  ];
}

function makeDeps(workspace = makeWorkspace()) {
  return {
    getCurrentUser: vi.fn(async () => ({
      displayName: "Dev user",
      firmId: "dev-firm",
      id: "dev-user",
    })),
    getDocumentRevisionSummariesByCaseId: vi.fn(async () =>
      makeRevisionSummaries(),
    ),
    getWorkspaceById: vi.fn(async () => ({ ok: true, workspace }) as const),
    getWorkspaceBySlug: vi.fn(async () => ({ ok: true, workspace }) as const),
    listCases: vi.fn(async () => [workspace.case]),
    recordReviewActionEvent: vi.fn(async () => ({
      action_key: "review-action-notice-service",
      action_label: "Review notice",
      assigned_role: "paralegal",
      blocking: true,
      case_id: caseId,
      created_at: now,
      id: reviewActionId,
      kind: "missing",
      priority: "high",
      raw_refs: [
        {
          id: "notice-service-missing",
          key: "notice-service-missing",
          kind: "harness_finding",
          label: "Notice service method missing",
          runId: null,
          sourceKey: "ud-100",
        },
      ],
      reducer_run_id: reducerRunId,
      resolved_at: now,
      source_span_ids: [sourceSpanId],
      status: "resolved",
      summary: "Item 10 does not select a notice service method.",
      title: "Notice service method not selected",
      updated_at: now,
    })),
  };
}

describe("Murdock MCP v1", () => {
  it("exposes typed business tools without prompt resources", () => {
    const descriptors = getMurdockMcpV1ToolDescriptors();
    const names = descriptors.map((descriptor) => descriptor.name);

    expect(names).toEqual([
      "list_cases",
      "get_case_context",
      "get_case_review_digest",
      "get_case_review_group",
      "list_case_documents",
      "get_open_review_actions",
      "get_document_updates",
      "get_operational_signals",
      "get_source_span",
      "search_case_evidence",
      "record_review_action_event",
    ] satisfies MurdockMcpToolName[]);
    expect(names).not.toContain("run_sql");
    expect(names).not.toContain("get_all_case_json");
    expect(
      descriptors.some((descriptor) => descriptor.name.includes("prompt")),
    ).toBe(false);
  });

  it("returns open review actions with source spans through case scope", async () => {
    const result = await executeMurdockMcpV1Tool(
      "get_open_review_actions",
      { caseId },
      makeDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.version).toBe(MURDOCK_MCP_VERSION);
    expect(result.toolName).toBe("get_open_review_actions");
    expect(result.data).toMatchObject({
      reviewActions: [
        {
          actionRef: opaqueRef("action", reviewActionId),
          status: "open",
          title: "Notice service method not selected",
        },
      ],
      sourceSpans: [
        {
          sourceSpanRef: opaqueRef("span", sourceSpanId),
          verbatimExcerpt: "Notice service method is not selected.",
        },
      ],
    });
    expectNoInternalIds(result.data);
  });

  it("returns a compact deterministic case review digest for broad questions", async () => {
    const workspace = makeWorkspace({
      reviewActions: [
        ...makeWorkspace().reviewActions,
        {
          actionKey: "conflict-action",
          actionLabel: "Resolve conflict",
          assignedRole: "lawyer",
          blocking: true,
          caseId,
          createdAt: now,
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          kind: "conflict",
          priority: "critical",
          rawRefs: [
            {
              id: "checkbox-conflict",
              key: "checkbox-conflict",
              kind: "harness_conflict",
              label: "Mutually exclusive checkboxes",
              runId: null,
              sourceKey: "ud-100",
            },
          ],
          reducerRunId,
          resolvedAt: null,
          sourceSpanIds: [sourceSpanId],
          status: "open",
          summary: "Complaint and amended complaint are both selected.",
          title: "Complaint type conflict",
          updatedAt: now,
        },
        {
          actionKey: "low-action",
          actionLabel: "Check later",
          assignedRole: "paralegal",
          blocking: false,
          caseId,
          createdAt: now,
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          kind: "source_check",
          priority: "low",
          rawRefs: [
            {
              id: "construction-year",
              key: "construction-year",
              kind: "harness_finding",
              label: "Construction year missing",
              runId: null,
              sourceKey: "ud-100",
            },
          ],
          reducerRunId,
          resolvedAt: null,
          sourceSpanIds: [],
          status: "open",
          summary: "Premises construction year is blank.",
          title: "Premises construction year missing",
          updatedAt: now,
        },
      ],
    });
    const result = await executeMurdockMcpV1Tool(
      "get_case_review_digest",
      { caseId },
      makeDeps(workspace),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data).toMatchObject({
      counts: {
        conflictOpenActionCount: 1,
        omittedLowPriorityCount: 1,
        openActionCount: 3,
      },
      groups: [
        {
          audience: "lawyer",
          itemCount: 1,
          items: [],
          key: "lawyer_decisions",
          label: "Lawyer decisions",
          omittedCount: 1,
          sampleTitles: ["Complaint type conflict"],
        },
        {
          audience: "paralegal",
          itemCount: 1,
          items: [],
          key: "blocking_form_work",
          label: "Blocking form-filling work",
          omittedCount: 1,
          sampleTitles: ["Notice service method not selected"],
        },
      ],
    });
    expect(JSON.stringify(result.data)).not.toContain("rawRefs");
    expectNoInternalIds(result.data);
  });

  it("drills into one review digest group without returning every group", async () => {
    const workspace = makeWorkspace({
      reviewActions: [
        ...makeWorkspace().reviewActions,
        {
          actionKey: "conflict-action",
          actionLabel: "Resolve conflict",
          assignedRole: "lawyer",
          blocking: true,
          caseId,
          createdAt: now,
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          kind: "conflict",
          priority: "critical",
          rawRefs: [
            {
              id: "checkbox-conflict",
              key: "checkbox-conflict",
              kind: "harness_conflict",
              label: "Mutually exclusive checkboxes",
              runId: null,
              sourceKey: "ud-100",
            },
          ],
          reducerRunId,
          resolvedAt: null,
          sourceSpanIds: [sourceSpanId],
          status: "open",
          summary: "Complaint and amended complaint are both selected.",
          title: "Complaint type conflict",
          updatedAt: now,
        },
      ],
    });
    const result = await executeMurdockMcpV1Tool(
      "get_case_review_group",
      {
        caseId,
        groupKey: "lawyer_decisions",
        maxItems: 1,
      },
      makeDeps(workspace),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data).toMatchObject({
      group: {
        itemCount: 1,
        items: [
          {
            actionRef: opaqueRef(
              "action",
              "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            ),
            summary: "Complaint and amended complaint are both selected.",
            title: "Complaint type conflict",
          },
        ],
        key: "lawyer_decisions",
        omittedCount: 0,
      },
    });
    expectNoInternalIds(result.data);
  });

  it("searches evidence without an LLM call", async () => {
    const deps = makeDeps();
    const result = await executeMurdockMcpV1Tool(
      "search_case_evidence",
      { caseSlug: "example-case", query: "plaintiff", limit: 5 },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(deps.getWorkspaceBySlug).toHaveBeenCalledWith("example-case");
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data).toMatchObject({
      matches: expect.arrayContaining([
        expect.objectContaining({
          kind: "fact",
          label: "Plaintiff name",
        }),
        expect.objectContaining({
          kind: "document_update",
          label: "Plaintiff name",
        }),
      ]),
      query: "plaintiff",
    });
  });

  it("does not expose internal UUIDs or raw app refs across read tools", async () => {
    const deps = makeDeps();
    const calls = [
      ["list_cases", { limit: 5 }],
      [
        "get_case_context",
        {
          caseId,
          sections: [
            "documents",
            "facts",
            "chronology",
            "issues",
            "review_actions",
            "source_spans",
          ],
        },
      ],
      ["list_case_documents", { caseId }],
      ["get_case_review_digest", { caseId }],
      [
        "get_case_review_group",
        { caseId, groupKey: "blocking_form_work", maxItems: 5 },
      ],
      ["get_open_review_actions", { caseId, includeSourceSpans: true }],
      ["get_document_updates", { caseId }],
      ["get_operational_signals", { caseId, limit: 10 }],
      ["get_source_span", { caseId, sourceSpanRef: opaqueRef("span", sourceSpanId) }],
      ["search_case_evidence", { caseId, query: "plaintiff", limit: 10 }],
    ] as const;

    for (const [toolName, input] of calls) {
      const result = await executeMurdockMcpV1Tool(toolName, input, deps);

      expect(result.ok, toolName).toBe(true);
      if (result.ok) {
        expectNoInternalIds(result.data);
      }
    }
  });

  it("returns deterministic operational signals coupled to reducer output", async () => {
    const result = await executeMurdockMcpV1Tool(
      "get_operational_signals",
      { caseSlug: "example-case", includeInformational: true, limit: 10 },
      makeDeps(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.toolName).toBe("get_operational_signals");
    expect(result.data).toMatchObject({
      signals: expect.arrayContaining([
        expect.objectContaining({
          generatedBy: "review_reducer",
          signalRef: expect.stringMatching(/^signal_[a-f0-9]{16}$/),
          signalType: "review_action_opened",
          sourceSpanCount: 1,
          state: "active",
          title: "Notice service method not selected",
        }),
        expect.objectContaining({
          generatedBy: "document_revision",
          signalRef: expect.stringMatching(/^signal_[a-f0-9]{16}$/),
          signalType: "document_changed",
          title: "Document update: Plaintiff name",
        }),
      ]),
    });
    expectNoInternalIds(result.data);
  });

  it("records review action events and returns updated action status", async () => {
    const deps = makeDeps();
    const result = await executeMurdockMcpV1Tool(
      "record_review_action_event",
      {
        actionRef: opaqueRef("action", reviewActionId),
        caseId,
        eventType: "resolved",
        note: "Confirmed from source.",
      },
      deps,
    );

    expect(result.ok).toBe(true);
    expect(deps.recordReviewActionEvent).toHaveBeenCalledWith({
      actionId: reviewActionId,
      actorId: "dev-user",
      caseId,
      eventType: "resolved",
      note: "Confirmed from source.",
    });
    if (!result.ok) {
      throw new Error(result.message);
    }

    expect(result.data).toMatchObject({
      action: {
        actionRef: opaqueRef("action", reviewActionId),
        resolvedAt: now,
        status: "resolved",
      },
      eventType: "resolved",
    });
    expectNoInternalIds(result.data);
  });

  it("rejects unsupported or invalid tool calls before backend access", async () => {
    const deps = makeDeps();
    const unsupported = await executeMurdockMcpV1Tool(
      "run_sql",
      { sql: "select * from cases" },
      deps,
    );
    const invalid = await executeMurdockMcpV1Tool(
      "get_source_span",
      { caseId },
      deps,
    );

    expect(unsupported).toMatchObject({
      errorCategory: "unsupported_tool",
      ok: false,
      toolName: null,
    });
    expect(invalid).toMatchObject({
      errorCategory: "schema_validation",
      ok: false,
      toolName: "get_source_span",
    });
    expect(deps.getWorkspaceById).not.toHaveBeenCalled();
  });

  it("supports contained MCP-shaped JSON-RPC discovery", async () => {
    const initialized = await handleMurdockMcpV1JsonRpc({
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
    });
    const listed = await handleMurdockMcpV1JsonRpc({
      id: 2,
      jsonrpc: "2.0",
      method: "tools/list",
    });

    expect(initialized).toMatchObject({
      id: 1,
      result: {
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "murdock-contained-mcp",
          version: MURDOCK_MCP_VERSION,
        },
      },
    });
    expect(listed).toMatchObject({
      id: 2,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "get_open_review_actions",
          }),
        ]),
      },
    });
  });

  it("supports MCP ping and ignores JSON-RPC notifications", async () => {
    const pinged = await handleMurdockMcpV1JsonRpc({
      id: 3,
      jsonrpc: "2.0",
      method: "ping",
    });
    const initializedNotification = await handleMurdockMcpV1JsonRpc({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });

    expect(pinged).toMatchObject({
      id: 3,
      result: {},
    });
    expect(initializedNotification).toBeNull();
  });
});
