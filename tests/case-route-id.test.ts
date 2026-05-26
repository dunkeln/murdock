import { describe, expect, it } from "vitest";

import { createCaseRouteId } from "@/lib/case-route-id";

describe("case route ids", () => {
  it("creates stable opaque route ids from case ids", () => {
    const caseId = "11111111-1111-4111-8111-111111111111";

    expect(createCaseRouteId(caseId)).toBe(createCaseRouteId(caseId));
    expect(createCaseRouteId(caseId)).toMatch(/^[a-f0-9]{20}$/);
    expect(createCaseRouteId(caseId)).not.toContain("untitled");
    expect(createCaseRouteId(caseId)).not.toContain("case");
  });
});
