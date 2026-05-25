import "server-only";

import {
  type Conflict,
  type Finding,
  type ReviewGate,
  gateSchema,
} from "@/lib/contracts/harness";

function isMaterial(target: Pick<Finding, "materiality">) {
  return target.materiality === "critical" || target.materiality === "high";
}

function gate(input: ReviewGate): ReviewGate {
  return gateSchema.parse(input);
}

function gateForFinding(finding: Finding): ReviewGate {
  if (finding.status === "out_of_scope") {
    return gate({
      targetId: finding.id,
      targetType: "finding",
      level: "G3_hard_gate",
      routedTo: "lawyer",
      blocking: true,
      reasonCodes: ["external_law"],
      reviewQuestion: "This requires analysis outside the OCR bundle. Review manually?",
    });
  }

  if (isMaterial(finding) && finding.sourceSpans.length === 0) {
    return gate({
      targetId: finding.id,
      targetType: "finding",
      level: "G3_hard_gate",
      routedTo: "lawyer",
      blocking: true,
      reasonCodes: ["no_source"],
      reviewQuestion: "This material finding has no source support. Remove, revise, or supply source?",
    });
  }

  if (
    finding.confidenceBasis.ocrQuality === "poor" &&
    ["high", "medium"].includes(finding.materiality)
  ) {
    return gate({
      targetId: finding.id,
      targetType: "finding",
      level: "G2_targeted_review",
      routedTo: "paralegal",
      blocking: false,
      reasonCodes: ["low_ocr"],
      reviewQuestion: "Verify the highlighted OCR span against the source image.",
    });
  }

  if (
    ["missing", "unclear", "unsupported"].includes(finding.status) &&
    ["high", "medium"].includes(finding.materiality)
  ) {
    return gate({
      targetId: finding.id,
      targetType: "finding",
      level: "G2_targeted_review",
      routedTo: "paralegal",
      blocking: false,
      reasonCodes: ["missing_or_unclear"],
      reviewQuestion: "Can this field be confirmed elsewhere in the OCR bundle?",
    });
  }

  if (finding.evidenceQuality === "partial") {
    return gate({
      targetId: finding.id,
      targetType: "finding",
      level: "G1_passive_flag",
      routedTo: null,
      blocking: false,
      reasonCodes: ["partial_source"],
      reviewQuestion: null,
    });
  }

  return gate({
    targetId: finding.id,
    targetType: "finding",
    level: "G0_no_human",
    routedTo: null,
    blocking: false,
    reasonCodes: [],
    reviewQuestion: null,
  });
}

function gateForConflict(conflict: Conflict): ReviewGate {
  const hard = conflict.materiality === "critical" || conflict.materiality === "high";

  return gate({
    targetId: conflict.id,
    targetType: "conflict",
    level: hard ? "G3_hard_gate" : "G2_targeted_review",
    routedTo: hard ? "lawyer" : "paralegal",
    blocking: hard,
    reasonCodes: [hard ? "material_conflict" : "source_conflict"],
    reviewQuestion: hard
      ? "Which source controls, or should this remain unresolved?"
      : "Check whether this conflict is caused by duplicate, stale, or misread documents.",
  });
}

export function computeGates(input: {
  conflicts: Conflict[];
  findings: Finding[];
}): ReviewGate[] {
  return [
    ...input.findings.map(gateForFinding),
    ...input.conflicts.map(gateForConflict),
  ];
}
