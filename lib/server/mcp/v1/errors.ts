import "server-only";

import type { MurdockMcpToolResult } from "@/lib/contracts/mcp";

export class MurdockMcpServiceError extends Error {
  constructor(
    readonly errorCategory: Exclude<
      MurdockMcpToolResult,
      { ok: true }
    >["errorCategory"],
    message: string,
    readonly isRetryable = false,
  ) {
    super(message);
  }
}
