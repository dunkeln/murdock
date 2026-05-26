import "server-only";

import { z } from "zod";

import type { MurdockMcpToolResult } from "@/lib/contracts/mcp";
import { generateObject } from "@/lib/server/ai/generate-object";
import {
  executeMurdockMcpV1Tool,
  getMurdockMcpV1ToolDescriptors,
} from "@/lib/server/mcp/v1/service";

const runtimeMcpToolNameSchema = z.enum([
  "get_case_context",
  "get_case_review_digest",
  "get_case_review_group",
  "list_case_documents",
  "get_open_review_actions",
  "get_document_updates",
  "get_operational_signals",
  "get_source_span",
  "search_case_evidence",
]);

type RuntimeMcpToolName = z.infer<typeof runtimeMcpToolNameSchema>;

export type RuntimeMcpTraceEvent = {
  label: string;
  status: "started" | "completed";
};

export type RuntimeMcpSubscriber = (event: RuntimeMcpTraceEvent) => void;

export type WorkspaceMcpToolResultForModel = {
  contextLabel: string;
  data: unknown;
  ok: boolean;
};

const runtimeMcpAliases = {
  get_case_context: "Reviewed case context",
  get_case_review_digest: "Reviewed action summary",
  get_case_review_group: "Reviewed action details",
  list_case_documents: "Checked document list",
  get_open_review_actions: "Checked open actions",
  get_document_updates: "Checked document updates",
  get_operational_signals: "Checked case signals",
  get_source_span: "Checked supporting evidence",
  search_case_evidence: "Searched case evidence",
} satisfies Record<RuntimeMcpToolName, string>;

const mcpToolSelectionSchema = z.object({
  calls: z
    .array(
      z.object({
        input: z.record(z.string(), z.unknown()).default({}),
        toolName: runtimeMcpToolNameSchema,
      }),
    )
    .min(1)
    .max(4),
});

type McpRuntimeCall = {
  input: Record<string, unknown>;
  name: RuntimeMcpToolName;
};

type McpSelectionResult =
  | {
      calls: McpRuntimeCall[];
      ok: true;
    }
  | {
      errorCategory: "configuration" | "provider" | "schema_validation";
      isRetryable: boolean;
      message: string;
      ok: false;
    };

export type WorkspaceMcpContextResult =
  | {
      contextTrace: RuntimeMcpTraceEvent[];
      mcpToolResults: WorkspaceMcpToolResultForModel[];
      ok: true;
    }
  | {
      errorCategory:
        | "configuration"
        | "not_found"
        | "provider"
        | "schema_validation"
        | "unknown";
      isRetryable: boolean;
      message: string;
      ok: false;
    };

function readableToolDescriptors() {
  const allowedTools = new Set<RuntimeMcpToolName>(runtimeMcpToolNameSchema.options);

  return getMurdockMcpV1ToolDescriptors()
    .filter((descriptor) =>
      allowedTools.has(descriptor.name as RuntimeMcpToolName),
    )
    .map((descriptor) => ({
      description: descriptor.description,
      inputSchema: descriptor.inputSchema,
      name: descriptor.name,
      title: descriptor.title,
    }));
}

function caseScopedInput(input: {
  caseId: string;
  mcpInput: Record<string, unknown>;
  question: string;
  toolName: RuntimeMcpToolName;
}) {
  const mcpInput: Record<string, unknown> = {
    ...input.mcpInput,
    caseId: input.caseId,
  };

  if (input.toolName === "search_case_evidence" && !mcpInput.query) {
    mcpInput.query = input.question;
  }

  return mcpInput;
}

async function selectMcpRuntimeCalls(input: {
  caseId: string;
  question: string;
}): Promise<McpSelectionResult> {
  const result = await generateObject({
    allowFallback: false,
    maxOutputTokens: 700,
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          {
            caseId: input.caseId,
            question: input.question,
            tools: readableToolDescriptors(),
          },
          null,
          2,
        ),
      },
    ],
    preferredProvider: "anthropic",
    schema: mcpToolSelectionSchema,
    schemaDescription:
      "Select the read-only Murdock MCP calls needed to answer the user question.",
    schemaName: "murdock_workspace_mcp_tool_selection_v1",
    system:
      "You are the Murdock MCP connector. Select only read-only MCP tools needed for the user question. Do not answer the question. Do not request raw database access. Prefer one or two focused calls.",
    temperature: 0,
    use: "workspace-query",
  });

  if (!result.ok) {
    return {
      ok: false,
      errorCategory:
        result.error.errorCategory === "configuration"
          ? "configuration"
          : result.error.errorCategory === "schema_validation"
            ? "schema_validation"
            : "provider",
      isRetryable: result.error.isRetryable,
      message: result.error.message,
    };
  }

  return {
    ok: true,
    calls: result.data.calls.map((call) => ({
      input: caseScopedInput({
        caseId: input.caseId,
        mcpInput: call.input,
        question: input.question,
        toolName: call.toolName,
      }),
      name: call.toolName,
    })),
  };
}

async function runMcpRuntimeCalls(input: {
  calls: McpRuntimeCall[];
  subscriber?: RuntimeMcpSubscriber;
}) {
  return Promise.all(
    input.calls.map(async (call) => {
      const label = runtimeMcpAliases[call.name];
      input.subscriber?.({ label, status: "started" });

      const result = await executeMurdockMcpV1Tool(call.name, call.input);
      input.subscriber?.({ label, status: "completed" });

      return {
        input: call.input,
        result,
        toolName: call.name,
      };
    }),
  );
}

function firstMcpError(results: { result: MurdockMcpToolResult }[]) {
  return results.find((item) => !item.result.ok)?.result;
}

export async function prepareWorkspaceMcpContext(input: {
  caseId: string;
  question: string;
  subscriber?: RuntimeMcpSubscriber;
}): Promise<WorkspaceMcpContextResult> {
  const contextTrace: RuntimeMcpTraceEvent[] = [];
  const subscriber: RuntimeMcpSubscriber = (event) => {
    contextTrace.push(event);
    input.subscriber?.(event);
  };
  const selectedCalls = await selectMcpRuntimeCalls(input);

  if (!selectedCalls.ok) {
    return {
      ok: false,
      errorCategory: selectedCalls.errorCategory,
      isRetryable: selectedCalls.isRetryable,
      message: selectedCalls.message,
    };
  }

  const mcpResults = await runMcpRuntimeCalls({
    calls: selectedCalls.calls,
    subscriber,
  });
  const mcpError = firstMcpError(mcpResults);

  if (mcpError && !mcpError.ok) {
    return {
      ok: false,
      errorCategory:
        mcpError.errorCategory === "not_found"
          ? "not_found"
          : mcpError.errorCategory === "schema_validation"
            ? "schema_validation"
            : "unknown",
      isRetryable: mcpError.isRetryable,
      message: mcpError.message,
    };
  }

  return {
    ok: true,
    contextTrace,
    mcpToolResults: mcpResults.map((item) => ({
      contextLabel: runtimeMcpAliases[item.toolName],
      data: item.result.ok ? item.result.data : null,
      ok: item.result.ok,
    })),
  };
}
