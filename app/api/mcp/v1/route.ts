import { NextResponse } from "next/server";

import {
  handleMurdockMcpV1JsonRpc,
  getMurdockMcpV1ToolDescriptors,
} from "@/lib/server/mcp/v1";
import { MURDOCK_MCP_VERSION } from "@/lib/contracts/mcp";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const token = process.env.MURDOCK_MCP_API_TOKEN?.trim();

  if (!token) {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${token}`;
}

function jsonRpcUnauthorized() {
  return NextResponse.json(
    {
      error: {
        code: -32001,
        message: "Unauthorized MCP request.",
      },
      id: null,
      jsonrpc: "2.0",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status: 401,
    },
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return jsonRpcUnauthorized();
  }

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
  if (!isAuthorized(request)) {
    return jsonRpcUnauthorized();
  }

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
