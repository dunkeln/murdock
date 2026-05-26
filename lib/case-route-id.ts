import { createHash } from "node:crypto";

export function createCaseRouteId(caseId: string): string {
  return createHash("sha256").update(caseId).digest("hex").slice(0, 20);
}
