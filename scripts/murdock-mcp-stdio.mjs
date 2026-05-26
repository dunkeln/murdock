#!/usr/bin/env node

import process from "node:process";
import readline from "node:readline";

const endpoint =
  process.env.MURDOCK_MCP_HTTP_URL ?? "http://localhost:3000/api/mcp/v1";
const timeoutMs = Number(process.env.MURDOCK_MCP_TIMEOUT_MS ?? "30000");
const apiToken = process.env.MURDOCK_MCP_API_TOKEN?.trim();

function log(level, event, fields = {}) {
  process.stderr.write(
    `${JSON.stringify({
      event,
      level,
      pid: process.pid,
      timestamp: new Date().toISOString(),
      ...fields,
    })}\n`,
  );
}

function writeJson(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function jsonRpcError(id, code, message) {
  return {
    error: {
      code,
      message,
    },
    id: id ?? null,
    jsonrpc: "2.0",
  };
}

async function postJsonRpc(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      accept: "application/json",
      "content-type": "application/json",
    };

    if (apiToken) {
      headers.authorization = `Bearer ${apiToken}`;
    }

    const response = await fetch(endpoint, {
      body: JSON.stringify(request),
      headers,
      method: "POST",
      signal: controller.signal,
    });

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();

    if (!text) {
      return jsonRpcError(
        request.id,
        -32000,
        `Murdock MCP endpoint returned HTTP ${response.status} with an empty body.`,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      return jsonRpcError(
        request.id,
        -32700,
        `Murdock MCP endpoint returned invalid JSON with HTTP ${response.status}.`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function handleLine(line) {
  const raw = line.trim();

  if (!raw) {
    return;
  }

  let request;

  try {
    request = JSON.parse(raw);
  } catch {
    writeJson(jsonRpcError(null, -32700, "Parse error."));
    return;
  }

  if (typeof request !== "object" || request === null || Array.isArray(request)) {
    writeJson(jsonRpcError(null, -32600, "Invalid JSON-RPC request."));
    return;
  }

  const hasId = Object.hasOwn(request, "id");

  try {
    if (!hasId) {
      log("debug", "mcp_notification_received", {
        method: typeof request.method === "string" ? request.method : null,
      });
      await postJsonRpc(request);
      return;
    }

    const response = await postJsonRpc(request);

    if (response !== null) {
      writeJson(response);
    }
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    const message = isAbort
      ? `Murdock MCP endpoint timed out after ${timeoutMs}ms.`
      : error instanceof Error
        ? error.message
        : "Unknown Murdock MCP bridge failure.";

    log("error", "mcp_forward_failed", {
      isRetryable: true,
      message,
      method: typeof request.method === "string" ? request.method : null,
    });

    if (hasId) {
      writeJson(jsonRpcError(request.id, -32000, message));
    }
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stderr,
  terminal: false,
});
const pendingRequests = new Set();

log("info", "mcp_stdio_bridge_started", { endpoint });

rl.on("line", (line) => {
  const pendingRequest = handleLine(line).finally(() => {
    pendingRequests.delete(pendingRequest);
  });

  pendingRequests.add(pendingRequest);
});

rl.on("close", () => {
  void Promise.allSettled([...pendingRequests]).finally(() => {
    log("info", "mcp_stdio_bridge_closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  log("info", "mcp_stdio_bridge_signal", { signal: "SIGINT" });
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("info", "mcp_stdio_bridge_signal", { signal: "SIGTERM" });
  process.exit(0);
});
