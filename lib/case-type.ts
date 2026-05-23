import type { CaseType } from "@/lib/contracts/cases";

export const caseTypeLabels = {
  bankruptcy: "Bankruptcy",
  immigration: "Immigration",
  general: "General",
} satisfies Record<CaseType, string>;

export function getCaseTypeLabel(caseType: CaseType) {
  return caseTypeLabels[caseType];
}
