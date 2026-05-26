import type { FindingDraft } from "@/lib/contracts/harness";
import type { HarnessV2DocumentAnnotation } from "@/lib/contracts/harness-v2";
import type { SourceMap } from "@/lib/server/harness/workflows/v1/source";

export type LegalReviewCandidate = {
  id: string;
  importance: FindingDraft["importance"];
  note: string;
  problem: NonNullable<FindingDraft["problem"]>;
  sourceSpanIds: string[];
  title: string;
  type: string;
};

export type LegalReviewFieldState = {
  sourceSpanIds: string[];
  state: "missing" | "present" | "unknown";
  value: string | null;
};

export type LegalReviewCheckboxGroupState = {
  checked: string[];
  sourceSpanIds: string[];
};

export type LegalReviewAttachmentState = {
  markedAttached: boolean | null;
  sourceSpanIds: string[];
};

export type LegalReviewSignatureState = {
  dated: boolean | null;
  signed: boolean | null;
  sourceSpanIds: string[];
};

export type LegalReviewFormState = {
  annotation: HarnessV2DocumentAnnotation | null;
  attachments: Record<string, LegalReviewAttachmentState>;
  checkboxGroups: Record<string, LegalReviewCheckboxGroupState>;
  fields: Record<string, LegalReviewFieldState>;
  formType: "ca_ud_100" | "unknown";
  normalizedText: string;
  signatures: Record<string, LegalReviewSignatureState>;
  source: SourceMap;
};
