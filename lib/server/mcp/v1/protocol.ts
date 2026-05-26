import "server-only";

import { z } from "zod";

import { MURDOCK_MCP_VERSION } from "@/lib/contracts/mcp";
import {
  executeMurdockMcpV1Tool,
  getMurdockMcpV1ToolDescriptors,
} from "@/lib/server/mcp/v1/service";

const jsonRpcRequestSchema = z.object({
  id: z.union([z.string(), z.number()]).nullable().optional(),
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

const supportedJsonRpcMethodSchema = z.enum([
  "initialize",
  "ping",
  "tools/list",
  "tools/call",
]);

const toolsCallParamsSchema = z.object({
  arguments: z.unknown().default({}),
  name: z.string().min(1),
});

type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

function jsonRpcSuccess(request: JsonRpcRequest, result: unknown) {
  return {
    id: request.id ?? null,
    jsonrpc: "2.0" as const,
    result,
  };
}

function jsonRpcError(input: {
  code: number;
  id: JsonRpcRequest["id"] | null;
  message: string;
}) {
  return {
    error: {
      code: input.code,
      message: input.message,
    },
    id: input.id ?? null,
    jsonrpc: "2.0" as const,
  };
}

export async function handleMurdockMcpV1JsonRpc(rawRequest: unknown) {
  const parsedRequest = jsonRpcRequestSchema.safeParse(rawRequest);

  if (!parsedRequest.success) {
    return jsonRpcError({
      code: -32600,
      id: null,
      message:
        parsedRequest.error.issues[0]?.message ?? "Invalid JSON-RPC request.",
    });
  }

  const request = parsedRequest.data;
  const isNotification = !Object.hasOwn(request, "id");

  if (isNotification) {
    return null;
  }

  const parsedMethod = supportedJsonRpcMethodSchema.safeParse(request.method);

  if (!parsedMethod.success) {
    return jsonRpcError({
      code: -32601,
      id: request.id ?? null,
      message: "Method not found.",
    });
  }

  if (parsedMethod.data === "initialize") {
    return jsonRpcSuccess(request, {
      capabilities: {
        tools: {},
      },
      protocolVersion: "2024-11-05",
      serverInfo: {
        name: "murdock-contained-mcp",
        version: MURDOCK_MCP_VERSION,
      },
    });
  }

  if (parsedMethod.data === "ping") {
    return jsonRpcSuccess(request, {});
  }

  if (parsedMethod.data === "tools/list") {
    return jsonRpcSuccess(request, {
      tools: getMurdockMcpV1ToolDescriptors().map((descriptor) => ({
        description: descriptor.description,
        inputSchema: descriptor.inputSchema,
        name: descriptor.name,
      })),
    });
  }

  const parsedParams = toolsCallParamsSchema.safeParse(request.params ?? {});

  if (!parsedParams.success) {
    return jsonRpcError({
      code: -32602,
      id: request.id ?? null,
      message: parsedParams.error.issues[0]?.message ?? "Invalid tool call.",
    });
  }

  const result = await executeMurdockMcpV1Tool(
    parsedParams.data.name,
    parsedParams.data.arguments,
  );

  return jsonRpcSuccess(request, {
    content: [
      {
        text: JSON.stringify(result, null, 2),
        type: "text",
      },
    ],
    isError: !result.ok,
    structuredContent: result,
  });
}
