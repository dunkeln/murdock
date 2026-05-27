import "server-only";

import { createHash } from "node:crypto";

export type McpRefPrefix =
  | "action"
  | "claim"
  | "doc"
  | "event"
  | "fact"
  | "issue"
  | "operation"
  | "plan"
  | "signal"
  | "span";

export function opaqueMcpRef(prefix: McpRefPrefix, id: string) {
  const digest = createHash("sha256")
    .update(`murdock-mcp.v1:${prefix}:${id}`)
    .digest("hex")
    .slice(0, 16);

  return `${prefix}_${digest}`;
}

export function sourceDocumentRef(documentId: string) {
  return opaqueMcpRef("doc", documentId);
}

export function sourceSpanRef(sourceSpanId: string) {
  return opaqueMcpRef("span", sourceSpanId);
}

export function reviewActionRef(actionId: string) {
  return opaqueMcpRef("action", actionId);
}

export function revisionClaimRef(claimId: string) {
  return opaqueMcpRef("claim", claimId);
}

export function issueRef(issueId: string) {
  return opaqueMcpRef("issue", issueId);
}

export function reviewerPlanRef(planKey: string) {
  return opaqueMcpRef("plan", planKey);
}
