import {
  ReviewActionPipeline,
  type ReviewerPlanResponse,
} from "@/components/app/case-workspace/components/review-action-pipeline";
import type { CaseControlDto } from "@/lib/case-control";

const seededControl: CaseControlDto = {
  activeItem: {
    blocking: true,
    id: "11111111-1111-4111-8111-111111111111",
    kind: "missing",
    priority: "high",
    reviewPrompt: "Find source support",
    sourceRefs: [
      {
        docId: "21111111-1111-4111-8111-111111111111",
        document: "Petition draft",
        fileName: "petition-draft.pdf",
        page: "4",
        pageIndex: 3,
        quote: "Signature block appears blank on the draft filing.",
        spanId: "31111111-1111-4111-8111-111111111111",
      },
    ],
    summary: "The filing signature block needs support before this matter is ready.",
    title: "Signature support missing",
  },
  case: {
    id: "seeded-review-case",
    priority: "urgent",
    title: "Seeded Review Matter",
  },
  footerEnabled: true,
  primaryDetail: "Signature support missing",
  primaryMessage: "Open item",
  queue: [
    {
      blocking: true,
      id: "11111111-1111-4111-8111-111111111111",
      kind: "missing",
      priority: "high",
      reviewPrompt: "Find source support",
      sourceRefs: [
        {
          docId: "21111111-1111-4111-8111-111111111111",
          document: "Petition draft",
          fileName: "petition-draft.pdf",
          page: "4",
          pageIndex: 3,
          quote: "Signature block appears blank on the draft filing.",
          spanId: "31111111-1111-4111-8111-111111111111",
        },
      ],
      summary: "The filing signature block needs support before this matter is ready.",
      title: "Signature support missing",
    },
    {
      blocking: true,
      id: "11111111-1111-4111-8111-222222222222",
      kind: "conflict",
      priority: "critical",
      reviewPrompt: "Choose controlling source",
      sourceRefs: [],
      summary: "Two sources disagree on the controlling filing date.",
      title: "Filing date conflict",
    },
    {
      blocking: false,
      id: "11111111-1111-4111-8111-333333333333",
      kind: "revision",
      priority: "medium",
      reviewPrompt: "Check current version",
      sourceRefs: [],
      summary: "A later document version changes a disclosure value.",
      title: "Review amended disclosure",
    },
    {
      blocking: false,
      id: "11111111-1111-4111-8111-444444444444",
      kind: "timeline",
      priority: "low",
      reviewPrompt: "Place in timeline",
      sourceRefs: [],
      summary: "A hearing notice should be placed into the matter chronology.",
      title: "Place hearing notice",
    },
  ],
  readiness: "needs_review",
  stats: {
    docs: 5,
    facts: 18,
    openItems: 4,
    sources: 11,
  },
};

const seededPlan: ReviewerPlanResponse = {
  case: {
    caseRef: "seeded-review-matter",
    clientName: null,
    nextAction: null,
    nextDeadlineAt: null,
    priority: "urgent",
    title: "Seeded Review Matter",
    type: "general",
    updatedAt: "2026-05-26T15:00:00.000Z",
  },
  choices: [
    {
      affectedReviewRefs: [
        "action_1111111111111111",
        "action_2222222222222222",
      ],
      actor: "case_team",
      choiceRef: "plan_1111111111111111",
      detail: "Stage the two blocking review items before any cleanup work.",
      eventType: "comment",
      id: "review_blocking_items",
      label: "Review blockers",
      rationale: "Highest ROI because both items affect filing readiness.",
      risk: "high",
      stageState: "staged",
      taskKind: "mark_for_case_team_review",
      tone: "recommended",
    },
    {
      affectedReviewRefs: ["action_1111111111111111"],
      actor: "case_team",
      choiceRef: "plan_2222222222222222",
      detail: "Handle only the signature-support item.",
      eventType: "comment",
      id: "work_signature_support",
      label: "Work signature item",
      rationale: "Smallest reversible next step with clear source grounding.",
      risk: "medium",
      stageState: "staged",
      taskKind: "mark_for_case_team_review",
      tone: "self_start",
    },
    {
      affectedReviewRefs: [
        "action_3333333333333333",
        "action_4444444444444444",
      ],
      actor: "case_team",
      choiceRef: "plan_3333333333333333",
      detail: "Preview resolving nonblocking review cleanup.",
      eventType: "dismissed",
      id: "dismiss_cleanup_items",
      label: "Dismiss cleanup",
      rationale: "Keeps low-risk cleanup from dominating review time.",
      risk: "low",
      stageState: "dismissed",
      taskKind: "dismiss_review_item",
      tone: "cleanup",
    },
  ],
  generatedAt: "2026-05-26T15:00:00.000Z",
  itemIdsByReviewRef: {
    action_1111111111111111: "11111111-1111-4111-8111-111111111111",
    action_2222222222222222: "11111111-1111-4111-8111-222222222222",
    action_3333333333333333: "11111111-1111-4111-8111-333333333333",
    action_4444444444444444: "11111111-1111-4111-8111-444444444444",
  },
  mcpTrace: [],
  model: null,
  plannerKind: "deterministic",
  provider: null,
  warnings: [],
};

export default function TestPage() {
  return (
    <main className="flex h-dvh min-h-dvh overflow-hidden bg-neutral-950 text-paper">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="min-h-0 overflow-hidden border border-paper/10 bg-ink/60 p-5">
          <div className="max-w-3xl">
            <h1 className="font-heading text-2xl uppercase leading-none">
              Review UX Test Harness
            </h1>
            <p className="mt-3 text-sm leading-6 text-paper/60">
              Seeded matter surface for testing reviewer-agent choices without
              the full workspace shell.
            </p>
          </div>
        </section>
        <ReviewActionPipeline
          className="min-h-0"
          control={seededControl}
          seededPlan={seededPlan}
        />
      </div>
    </main>
  );
}
