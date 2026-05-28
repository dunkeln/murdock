import "server-only";

import { z } from "zod";

import type { CanonicalHarnessView } from "@/lib/contracts/harness-view";
import type {
  CaseActionTask,
  CaseActionTaskActor,
  CaseActionTaskKind,
} from "@/lib/contracts/case-action-tasks";
import {
  getRoiReviewPlanOutputSchema,
  roiReviewPlanChoiceSchema,
} from "@/lib/contracts/mcp";
import {
  deriveReviewWorkItemCapability,
  type ReviewWorkItem,
} from "@/lib/contracts/review-work-item";
import {
  issueRef,
  reviewActionRef,
  reviewerPlanRef,
} from "@/lib/server/mcp/v1/refs";

const priorityRank: Record<ReviewWorkItem["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const LEGAL_SERVICE_REVIEWER_PROMPT = `
You are a reviewer agent for a legal case workspace.

Convert review issues, source evidence, temporal events, and matter state into
a small set of high-ROI legal service next steps. Do not optimize for current
system limitations. Think like a case-team operator deciding what should happen
next to move the matter forward.

Prefer actions a legal services team recognizes:
- request missing information from a client
- request or collect a missing document
- notify a client about a blocker or required step
- mark an issue for case_team review
- prepare a draft, redline, checklist update, or filing packet
- calendar a deadline
- calculate or verify an amount
- file, submit, or prepare for submission
- dismiss only when the item is clearly low-value or not actionable

Every action should have an actor, kind, title, rationale, linked review issues,
source/provenance refs when available, and expected outcome.

Action titles and details should be concise enough to work as queue items:
specific verb first, no legalese padding, no copied source paragraphs. Preserve
the operational punch and leave deeper evidence in linked review/source refs.

Before proposing new work, inspect the existing task queue. If an open queued,
in-progress, or blocked task already covers a review issue, do not propose a
duplicate action for that issue. It is valid to return no new choices when the
useful work has already been queued. Do not invent filler action items just
because your role is to recommend actions.

Bundle related source defects into one operational next step when that better
matches legal-service work. Example: if a petition source has missing signature,
missing date, missing printed name, missing debtor name, and missing court
district, do not create five separate action items. Prefer one bundled task
such as "Collect missing case information" or "Update filing-readiness
checklist" that links all covered review issues. Split only when different
actors, deadlines, or legal judgments truly require separate work.
`.trim();

export function reviewWorkItemRef(item: ReviewWorkItem) {
  return item.origin.sourceType === "workspace_issue"
    ? issueRef(item.id)
    : reviewActionRef(item.id);
}

export function sortReviewWorkItems(left: ReviewWorkItem, right: ReviewWorkItem) {
  return (
    priorityRank[left.priority] - priorityRank[right.priority] ||
    Number(right.blocking) - Number(left.blocking) ||
    left.title.localeCompare(right.title)
  );
}

function openReviewWorkItems(harnessView: CanonicalHarnessView) {
  return harnessView.reviewWorkItems.filter((item) => item.status === "open");
}

function activeTaskReviewRefs(tasks: CaseActionTask[]) {
  const refs = new Set<string>();

  for (const task of tasks) {
    if (task.status === "done" || task.status === "dismissed") {
      continue;
    }

    for (const ref of task.sourceReviewRefs) {
      refs.add(ref);
    }
  }

  return refs;
}

function unqueuedReviewWorkItems(input: {
  harnessView: CanonicalHarnessView;
  tasks: CaseActionTask[];
}) {
  const queuedRefs = activeTaskReviewRefs(input.tasks);

  return openReviewWorkItems(input.harnessView).filter(
    (item) => !queuedRefs.has(reviewWorkItemRef(item)),
  );
}

function caseSummary(harnessView: CanonicalHarnessView) {
  return {
    caseRef: harnessView.case.slug,
    clientName: harnessView.case.clientName,
    nextAction: harnessView.case.nextAction,
    nextDeadlineAt: harnessView.case.nextDeadlineAt,
    priority: harnessView.case.priority,
    title: harnessView.case.title,
    type: harnessView.case.type,
    updatedAt: harnessView.case.updatedAt,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function reviewTheme(item: ReviewWorkItem) {
  const text = `${item.title} ${item.summary}`.toLowerCase();

  if (
    /missing|not populated|not completed|not specified|not checked|blank|placeholder|not marked|no value|not entered/.test(
      text,
    )
  ) {
    return "completion";
  }

  if (text.includes("signature") || text.includes("signed")) {
    return "signature";
  }

  if (text.includes("date") || text.includes("deadline")) {
    return "date";
  }

  if (/income|asset|liabil|payment/.test(text)) {
    return "financial";
  }

  if (/court|filing|chapter|fee/.test(text)) {
    return "filing";
  }

  return item.kind.family;
}

function themeLabel(theme: string) {
  const labels: Record<string, string> = {
    completion: "missing case information",
    conflict: "source conflicts",
    date: "date gaps",
    filing: "filing readiness",
    financial: "financial blanks",
    missing: "missing support",
    revision: "version review",
    signature: "signature blockers",
    source_check: "source support",
    timeline: "timeline placement",
  };

  return labels[theme] ?? "top blockers";
}

function serviceActionForItem(item: ReviewWorkItem): {
  actor: CaseActionTaskActor;
  detail: string;
  id: string;
  kind: CaseActionTaskKind;
  label: string;
  rationale: string;
} {
  const text = `${item.title} ${item.summary}`.toLowerCase();

  if (/certificate|counseling|statement|schedule|document|proof|notice/.test(text)) {
    return {
      actor: "client",
      detail: `Request the missing document or supporting information needed to clear: ${item.title}.`,
      id: "request_missing_document",
      kind: "request_document",
      label: "Request missing document from client",
      rationale: "Missing client-side materials are usually resolved fastest through a direct collection task.",
    };
  }

  if (/address|phone|email|name|ssn|social security|debtor|income|asset|liabil|payment|amount|value/.test(text)) {
    return {
      actor: "client",
      detail: `Ask the client for the missing or corrected information needed to clear: ${item.title}.`,
      id: "request_client_information",
      kind: "request_information",
      label: "Request missing information from client",
      rationale: "The issue depends on facts the client or intake record must supply.",
    };
  }

  if (/signature|signed|attorney|certification|declaration/.test(text)) {
    return {
      actor: "case_team",
      detail: `Assign the signature or certification blocker for case-team review before filing: ${item.title}.`,
      id: "mark_signature_for_case_team_review",
      kind: "mark_for_case_team_review",
      label: "Mark signature issue for case team review",
      rationale: "Signature and certification issues should be routed to the responsible matter team before filing.",
    };
  }

  if (/district|court|chapter|filing|fee|petition|submit/.test(text)) {
    return {
      actor: "case_team",
      detail: `Update the filing-readiness checklist and flag the missing filing field: ${item.title}.`,
      id: "update_filing_readiness_checklist",
      kind: "update_checklist",
      label: "Update filing-readiness checklist",
      rationale: "Filing defects should become checklist blockers the case team can close before submission.",
    };
  }

  if (/redline|brief|draft|memo|packet|form/.test(text)) {
    return {
      actor: "case_team",
      detail: `Prepare a redline or draft update that highlights the issue for review: ${item.title}.`,
      id: "prepare_redline_for_case_team",
      kind: "prepare_redline",
      label: "Prepare redline for case team review",
      rationale: "Draft-facing issues are best resolved by making the proposed change visible for review.",
    };
  }

  if (/deadline|date|hearing|due/.test(text)) {
    return {
      actor: "case_team",
      detail: `Calendar or verify the relevant date before relying on this matter state: ${item.title}.`,
      id: "calendar_or_verify_deadline",
      kind: "calendar_deadline",
      label: "Calendar or verify deadline",
      rationale: "Date uncertainty creates downstream filing and client-service risk.",
    };
  }

  if (/bill|fee|invoice|time|hours|cost/.test(text)) {
    return {
      actor: "case_team",
      detail: `Calculate or record the amount/time needed for this issue: ${item.title}.`,
      id: "calculate_or_record_amount",
      kind: "calculate_amount",
      label: "Calculate amount or time",
      rationale: "Financial or billing issues need a concrete calculation before they can be closed.",
    };
  }

  return {
    actor: "case_team",
    detail: `Assign this issue to the case team for review and closure: ${item.title}.`,
    id: "mark_for_case_team_review",
    kind: "mark_for_case_team_review",
    label: "Mark for case team review",
    rationale: "The case team is the safest umbrella actor when the next legal-service owner is ambiguous.",
  };
}

function batchServiceAction(input: {
  items: ReviewWorkItem[];
  theme: string;
}): {
  actor: CaseActionTaskActor;
  detail: string;
  id: string;
  kind: CaseActionTaskKind;
  label: string;
  rationale: string;
} {
  const theme = input.theme;
  const count = input.items.length;

  if (theme === "signature") {
    return {
      actor: "case_team",
      detail: `Create one case-team review task for ${count} signature or certification blocker${count === 1 ? "" : "s"}.`,
      id: "mark_signature_batch_for_case_team_review",
      kind: "mark_for_case_team_review",
      label: "Mark signature blockers for case team review",
      rationale: "Signature blockers should be handled together before a filing packet moves forward.",
    };
  }

  if (theme === "completion") {
    return {
      actor: "case_team",
      detail: `Create one completion workflow for ${count} missing or incomplete source field${count === 1 ? "" : "s"}.`,
      id: "complete_missing_case_information_batch",
      kind: "update_checklist",
      label: "Collect missing case information",
      rationale: "Related blank fields should be bundled into one completion workflow instead of separate one-field tasks.",
    };
  }

  if (theme === "filing") {
    return {
      actor: "case_team",
      detail: `Update the filing-readiness checklist for ${count} filing blocker${count === 1 ? "" : "s"}.`,
      id: "update_filing_readiness_batch",
      kind: "update_checklist",
      label: "Update filing-readiness checklist",
      rationale: "Related filing defects should collapse into one checklist workflow.",
    };
  }

  if (theme === "financial") {
    return {
      actor: "client",
      detail: `Request the financial information needed to close ${count} related review item${count === 1 ? "" : "s"}.`,
      id: "request_financial_information_batch",
      kind: "request_information",
      label: "Request financial information from client",
      rationale: "Financial blanks usually need client-side facts before case-team review can resolve them.",
    };
  }

  if (theme === "date" || theme === "timeline") {
    return {
      actor: "case_team",
      detail: `Calendar or verify dates for ${count} related review item${count === 1 ? "" : "s"}.`,
      id: "calendar_or_verify_dates_batch",
      kind: "calendar_deadline",
      label: "Calendar or verify key dates",
      rationale: "Date uncertainty should be resolved as a single timeline-control task.",
    };
  }

  return {
    actor: "case_team",
    detail: `Prepare one case-team review task for ${count} related ${themeLabel(theme)} item${count === 1 ? "" : "s"}.`,
    id: "mark_related_items_for_case_team_review",
    kind: "mark_for_case_team_review",
    label: `Mark ${themeLabel(theme)} for case team review`,
    rationale: "A batch case-team task reduces review noise while preserving linked issue context.",
  };
}

function reviewRisk(items: ReviewWorkItem[]) {
  if (
    items.some(
      (item) =>
        item.priority === "critical" ||
        deriveReviewWorkItemCapability(item) === "legal_judgment",
    )
  ) {
    return "high" as const;
  }

  if (items.some((item) => item.blocking || item.priority === "high")) {
    return "medium" as const;
  }

  return "low" as const;
}

function uniqueSortedItems(items: ReviewWorkItem[]) {
  const seen = new Set<string>();
  const sorted = [];

  for (const item of [...items].sort(sortReviewWorkItems)) {
    const ref = reviewWorkItemRef(item);

    if (seen.has(ref)) {
      continue;
    }

    seen.add(ref);
    sorted.push(item);
  }

  return sorted;
}

function groupedItems(
  items: ReviewWorkItem[],
  keyFor: (item: ReviewWorkItem) => string,
) {
  const groups = new Map<string, ReviewWorkItem[]>();

  for (const item of items) {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return [...groups.entries()].sort(
    (left, right) =>
      right[1].filter((item) => item.blocking).length -
        left[1].filter((item) => item.blocking).length ||
      right[1].length - left[1].length ||
      left[0].localeCompare(right[0]),
  );
}

function actionableChoice(input: {
  actor: CaseActionTaskActor;
  caseKey: string;
  detail: string;
  eventType: "comment" | "resolved" | "dismissed" | "reopened";
  id: string;
  items: ReviewWorkItem[];
  kind: CaseActionTaskKind;
  label: string;
  rationale: string;
  stageState: "staged" | "deferred" | "dismissed";
  tone: "recommended" | "self_start" | "cleanup";
}) {
  const refs = input.items.map(reviewWorkItemRef).slice(0, 12);

  return roiReviewPlanChoiceSchema.parse({
    affectedReviewRefs: refs,
    actor: input.actor,
    choiceRef: reviewerPlanRef(
      `${input.caseKey}:${input.id}:${refs.join("|")}`,
    ),
    detail: input.detail,
    eventType: input.eventType,
    id: input.id,
    taskKind: input.kind,
    label: input.label,
    rationale: input.rationale,
    risk: reviewRisk(input.items),
    stageState: input.stageState,
    tone: input.tone,
  });
}

function dedupeChoices(
  choices: Array<z.infer<typeof roiReviewPlanChoiceSchema>>,
) {
  const seen = new Set<string>();

  return choices.filter((choice) => {
    const key = [...choice.affectedReviewRefs].sort().join("|");

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function choiceCoversReviewRef(
  choice: z.infer<typeof roiReviewPlanChoiceSchema>,
  reviewRef: string | null,
) {
  return Boolean(reviewRef && choice.affectedReviewRefs.includes(reviewRef));
}

function choiceCoveredReviewRefs(
  choices: Array<z.infer<typeof roiReviewPlanChoiceSchema>>,
) {
  return new Set(choices.flatMap((choice) => choice.affectedReviewRefs));
}

function compactText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function humanReviewItemLabel(item: ReviewWorkItem) {
  const candidates = [
    item.title,
    item.summary,
    item.reviewPrompt,
  ];

  for (const candidate of candidates) {
    const normalized = candidate
      .replace(/\bFinding\s+[a-f0-9]{8,}\b/gi, "")
      .replace(/\s*->\s*/g, " to ")
      .replace(/\bremoved in\b/gi, "changed in")
      .replace(/\s+/g, " ")
      .replace(/^[\\s:;.,-]+|[\\s:;.,-]+$/g, "")
      .trim();

    if (normalized && !/^finding\b/i.test(normalized)) {
      return normalized;
    }
  }

  return themeLabel(reviewTheme(item));
}

function taskSubject(items: ReviewWorkItem[]) {
  if (items.length === 0) {
    return "review issue";
  }

  if (items.length === 1) {
    return compactText(humanReviewItemLabel(items[0]!), 48).toLowerCase();
  }

  const subjects = items
    .slice(0, 2)
    .map((item) => compactText(humanReviewItemLabel(item), 26).toLowerCase());
  const remainder = items.length - subjects.length;

  return remainder > 0
    ? `${subjects.join(", ")} + ${remainder} more`
    : subjects.join(", ");
}

function reviewScopeLines(items: ReviewWorkItem[]) {
  const labels = items
    .slice(0, 3)
    .map((item) => compactText(humanReviewItemLabel(item), 42));
  const remainder = items.length - labels.length;

  return remainder > 0 ? [...labels, `+${remainder} more`] : labels;
}

export function synthesizeCaseActionTaskFromChoice(input: {
  choice: z.infer<typeof roiReviewPlanChoiceSchema>;
  items: ReviewWorkItem[];
}) {
  const title = compactText(
    input.items.length > 0
      ? `${input.choice.label}: ${taskSubject(input.items)}`
      : input.choice.label,
    100,
  );
  const scopeLines = reviewScopeLines(input.items);
  const covers = scopeLines.length > 0 ? `Covers: ${scopeLines.join("; ")}.` : null;

  return {
    description: [
      compactText(input.choice.detail, 180),
      `Why: ${compactText(input.choice.rationale, 180)}`,
      covers,
    ]
      .filter(Boolean)
      .join(" "),
    provenanceRefs: [
      {
        kind: "reviewer_choice",
        label: input.choice.label,
        ref: input.choice.choiceRef,
      },
      ...input.items.map((item) => ({
        kind: "review_work_item",
        label: item.title,
        ref: reviewWorkItemRef(item),
      })),
      ...input.items.flatMap((item) => item.provenanceRefs),
    ],
    title,
  };
}

export function buildActionableChoices(input: {
  activeReviewRef: string | null;
  harnessView: CanonicalHarnessView;
  maxChoices: number;
  tasks?: CaseActionTask[];
}) {
  const queuedRefs = activeTaskReviewRefs(input.tasks ?? []);
  const items = uniqueSortedItems(
    unqueuedReviewWorkItems({
      harnessView: input.harnessView,
      tasks: input.tasks ?? [],
    }),
  );
  const caseKey = input.harnessView.case.slug ?? input.harnessView.case.id;
  const highValueItems = uniqueSortedItems(
    items.filter((item) => item.blocking || item.priority !== "low"),
  );
  const candidates = highValueItems.length > 0 ? highValueItems : items;
  const grouped =
    groupedItems(candidates, reviewTheme).find(([, group]) => group.length >= 2)
      ?.[1] ?? candidates;
  const primary = uniqueSortedItems(grouped).slice(0, 8);
  const activeCandidate =
    input.activeReviewRef && !queuedRefs.has(input.activeReviewRef)
      ? items.find((item) => reviewWorkItemRef(item) === input.activeReviewRef)
      : null;
  const active = activeCandidate ?? candidates[0] ?? null;
  const choices: Array<z.infer<typeof roiReviewPlanChoiceSchema>> = [];

  if (primary.length > 0) {
    const theme = reviewTheme(primary[0]!);
    const batchAction = batchServiceAction({ items: primary, theme });

    choices.push(
      actionableChoice({
        actor: batchAction.actor,
        caseKey,
        detail: batchAction.detail,
        eventType: "comment",
        id: batchAction.id,
        items: primary,
        kind: batchAction.kind,
        label: batchAction.label,
        rationale: batchAction.rationale,
        stageState: "staged",
        tone: "recommended",
      }),
    );
  }

  if (active) {
    const activeAction = serviceActionForItem(active);
    const activeRef = reviewWorkItemRef(active);
    const alreadyCovered = choices.some((choice) =>
      choiceCoversReviewRef(choice, activeRef),
    );

    if (!alreadyCovered) {
      choices.push(
        actionableChoice({
          actor: activeAction.actor,
          caseKey,
          detail: activeAction.detail,
          eventType: "comment",
          id: activeAction.id,
          items: [active],
          kind: activeAction.kind,
          label: activeAction.label,
          rationale: activeAction.rationale,
          stageState: "staged",
          tone: "self_start",
        }),
      );
    }
  }

  const coveredRefs = choiceCoveredReviewRefs(choices);
  const sourceSweep = uniqueSortedItems(
    items.filter(
      (item) =>
        item.sourceSpanIds.length > 0 &&
        !coveredRefs.has(reviewWorkItemRef(item)),
    ),
  ).slice(0, 8);
  const cleanup = uniqueSortedItems(
    items.filter((item) => !item.blocking && item.priority === "low"),
  ).slice(0, 8);

  if (sourceSweep.length >= 2) {
    choices.push(
      actionableChoice({
        actor: "case_team",
        caseKey,
        detail: `Verify source evidence for ${sourceSweep.length} review item${
          sourceSweep.length === 1 ? "" : "s"
        } before case-team action.`,
        eventType: "comment",
        id: "verify_source_evidence_batch",
        items: sourceSweep,
        kind: "verify_source",
        label: "Verify source evidence",
        rationale: "Source verification is useful when evidence ambiguity blocks a cleaner service action.",
        stageState: "staged",
        tone: "self_start",
      }),
    );
  } else if (cleanup.length >= 2) {
    choices.push(
      actionableChoice({
        actor: "case_team",
        caseKey,
        detail: `Queue dismissal review for ${cleanup.length} low-risk item${
          cleanup.length === 1 ? "" : "s"
        }.`,
        eventType: "dismissed",
        id: "dismiss_low_risk_cleanup",
        items: cleanup,
        kind: "dismiss_review_item",
        label: "Dismiss low-risk cleanup",
        rationale: "Nonblocking cleanup should not dominate review time.",
        stageState: "dismissed",
        tone: "cleanup",
      }),
    );
  }

  return getRoiReviewPlanOutputSchema.parse({
    case: caseSummary(input.harnessView),
    choices: dedupeChoices(choices).slice(0, input.maxChoices),
    generatedAt: nowIso(),
    mcpTrace: [],
    model: null,
    plannerKind: "deterministic",
    provider: null,
    warnings:
      items.length > 0
        ? []
        : queuedRefs.size > 0
          ? ["Open review items are already covered by active queued tasks."]
          : ["No open review items are available for actionable planning."],
  });
}
