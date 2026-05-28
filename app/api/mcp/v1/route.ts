import { NextResponse } from "next/server";

import {
  handleMurdockMcpV1JsonRpc,
  getMurdockMcpV1ToolDescriptors,
} from "@/lib/server/mcp/v1";
import { MURDOCK_MCP_VERSION } from "@/lib/contracts/mcp";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      name: "murdock-contained-mcp",
      toolCount: getMurdockMcpV1ToolDescriptors().length,
      transport: "http-json-rpc",
      version: MURDOCK_MCP_VERSION,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  let rawRequest: unknown;

  try {
    rawRequest = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: -32700,
          message: "Parse error.",
        },
        id: null,
        jsonrpc: "2.0",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 400,
      },
    );
  }

  const response = await handleMurdockMcpV1JsonRpc(rawRequest);

  if (response === null) {
    return new Response(null, {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 204,
    });
  }

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
