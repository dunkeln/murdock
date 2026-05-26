import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/mcp/v1/route";

const originalMcpApiToken = process.env.MURDOCK_MCP_API_TOKEN;

function restoreMcpApiToken() {
  if (originalMcpApiToken === undefined) {
    delete process.env.MURDOCK_MCP_API_TOKEN;
    return;
  }

  process.env.MURDOCK_MCP_API_TOKEN = originalMcpApiToken;
}

function requestJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function readStdoutLine(child: ChildProcessWithoutNullStreams) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for MCP bridge stdout."));
    }, 2000);

    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.off("error", onError);
    }

    function onError(error: Error) {
      cleanup();
      reject(error);
    }

    function onData(chunk: Buffer) {
      buffer += chunk.toString("utf8");
      const newlineIndex = buffer.indexOf("\n");

      if (newlineIndex === -1) {
        return;
      }

      cleanup();
      resolve(buffer.slice(0, newlineIndex));
    }

    child.stdout.on("data", onData);
    child.on("error", onError);
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

afterEach(() => {
  restoreMcpApiToken();
});

describe("Murdock MCP Claude connector", () => {
  it("serves MCP JSON-RPC over the Next route", async () => {
    delete process.env.MURDOCK_MCP_API_TOKEN;

    const health = await GET(new Request("http://localhost/api/mcp/v1"));
    const listed = await POST(
      new Request("http://localhost/api/mcp/v1", {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
        }),
        method: "POST",
      }),
    );

    await expect(requestJson(health)).resolves.toMatchObject({
      name: "murdock-contained-mcp",
      transport: "http-json-rpc",
    });
    await expect(requestJson(listed)).resolves.toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "get_open_review_actions" }),
        ]),
      },
    });
  });

  it("requires the optional MCP bearer token when configured", async () => {
    process.env.MURDOCK_MCP_API_TOKEN = "test-token";

    const unauthorized = await GET(new Request("http://localhost/api/mcp/v1"));
    const authorized = await GET(
      new Request("http://localhost/api/mcp/v1", {
        headers: {
          authorization: "Bearer test-token",
        },
      }),
    );

    expect(unauthorized.status).toBe(401);
    await expect(requestJson(unauthorized)).resolves.toMatchObject({
      error: {
        code: -32001,
      },
    });
    expect(authorized.status).toBe(200);
  });

  it("bridges Claude stdio JSON-RPC to the local MCP route endpoint", async () => {
    const requests: unknown[] = [];
    const server = createServer((request, response) => {
      let body = "";

      request.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      request.on("end", () => {
        const parsed = JSON.parse(body) as { id?: string | number };
        requests.push(parsed);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: parsed.id ?? null,
            jsonrpc: "2.0",
            result: { ok: true },
          }),
        );
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address() as AddressInfo;
    const child = spawn(
      process.execPath,
      ["scripts/murdock-mcp-stdio.mjs"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MURDOCK_MCP_HTTP_URL: `http://127.0.0.1:${port}/api/mcp/v1`,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    try {
      child.stdin.write(
        `${JSON.stringify({ id: 7, jsonrpc: "2.0", method: "ping" })}\n`,
      );

      const line = await readStdoutLine(child);

      expect(JSON.parse(line)).toMatchObject({
        id: 7,
        jsonrpc: "2.0",
        result: { ok: true },
      });
      expect(requests).toEqual([
        {
          id: 7,
          jsonrpc: "2.0",
          method: "ping",
        },
      ]);
    } finally {
      child.kill();
      await closeServer(server);
    }
  });
});
