import {
  ArrowRight,
  Braces,
  Circle,
  ClipboardCheck,
  Database,
  FileText,
  GitBranch,
  LockKeyhole,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClaudeConnectorCopy } from "./claude-connector-copy";

type WorkflowStep = {
  detail: string;
  icon: LucideIcon;
  rows: readonly string[];
  title: string;
};

type ReviewItem = {
  choices: readonly string[];
  source: string;
  summary: string;
  title: string;
};

type HarnessLayer = {
  body: string;
  code: string;
  icon: LucideIcon;
  title: string;
};

type OperatingRule = {
  label: string;
  value: string;
};

const heroProofPoints = [
  "Reviewers lose time hunting across PDFs, notes, chats, and follow-ups.",
  "Document, finding, source evidence, human decision, and queue stay in one workspace.",
  "Working MVP: live dashboard, controlled agent harness, MCP access, and benchmark path.",
] as const;

const workflowSteps = [
  {
    detail: "Matter inputs stay immutable while the workspace builds an operating layer around them.",
    icon: FileText,
    rows: ["PDF", "DOCX", "email", "form"],
    title: "Source material",
  },
  {
    detail: "Claims carry page, quote, span, and document context before they become workflow state.",
    icon: Search,
    rows: ["page", "quote", "span ref"],
    title: "Provenance map",
  },
  {
    detail: "Missing support, conflicts, and deadline pressure become app-owned review consequences.",
    icon: ShieldCheck,
    rows: ["missing support", "conflict", "deadline"],
    title: "Review gates",
  },
  {
    detail: "Human decisions turn recommended moves into durable case-scoped follow-through.",
    icon: ClipboardCheck,
    rows: ["queued", "in review", "done"],
    title: "Action queue",
  },
] as const satisfies readonly WorkflowStep[];

const reviewItems = [
  {
    choices: ["Verify source evidence", "Mark missing support for review"],
    source: "p. 2 · signature line blank",
    summary: "The signature of the attorney or accredited representative is not provided.",
    title: "Signature of Attorney or Accredited Representative",
  },
  {
    choices: ["Verify source evidence", "Mark missing support for review"],
    source: "p. 2 · mailing field empty",
    summary: "The mailing address of the client is not provided.",
    title: "Mailing Address of Client",
  },
] as const satisfies readonly ReviewItem[];

const harnessLayers = [
  {
    body: "The model receives bounded source-span bundles and drafts meaning. It does not own the matter workflow.",
    code: "sourceSpanIds[] -> FindingDraft",
    icon: Braces,
    title: "Draft meaning",
  },
  {
    body: "The compiler checks real span refs, missing support, conflicts, and materiality before anything becomes app state.",
    code: "FindingDraft -> strict Finding",
    icon: ShieldCheck,
    title: "Validate claims",
  },
  {
    body: "Review consequences are deterministic: clean facts pass, unsupported or conflicting claims become human gates.",
    code: "Finding + Conflict -> ReviewGate",
    icon: LockKeyhole,
    title: "Gate risk",
  },
  {
    body: "Specialized subagents can take bounded real-time tasks, such as preparing a review plan or pulling evidence, without bypassing app state.",
    code: "Task -> scoped agent -> result",
    icon: ClipboardCheck,
    title: "Delegate work",
  },
  {
    body: "Resolved, ignored, queued, superseded, and done are explicit state transitions. Old issues do not vanish on refresh.",
    code: "MatterOperationEvent -> current state",
    icon: GitBranch,
    title: "Track lifecycle",
  },
] as const satisfies readonly HarnessLayer[];

const operatingRules = [
  {
    label: "Source of truth",
    value: "Original documents stay immutable; OCR and spans are traceable working copies.",
  },
  {
    label: "Control plane",
    value: "Schemas, validation, routing, review gates, queue state, and audit state live in the app.",
  },
  {
    label: "Agent boundary",
    value: "MCP exposes safe case digests, evidence, and queued tasks instead of raw database or transcript context.",
  },
] as const satisfies readonly OperatingRule[];

function SectionGrid({ className }: { className?: string }) {
  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 z-0 opacity-[0.08] [background-image:linear-gradient(to_right,var(--color-paper)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-paper)_1px,transparent_1px)] [background-size:2rem_2rem]",
          className,
        )}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--color-ink)_72%)]"
      />
    </>
  );
}

function HarnessLayerRow({ layer }: { layer: HarnessLayer }) {
  const Icon = layer.icon;

  return (
    <div className="grid min-w-0 gap-4 border-b border-paper/12 py-5 last:border-b-0 md:grid-cols-[9rem_minmax(0,1fr)_13rem] md:items-start">
      <div className="flex items-center gap-3">
        <Icon aria-hidden className="size-4 shrink-0 text-paper/55" strokeWidth={1.6} />
        <h3 className="font-heading text-2xl uppercase leading-none text-paper">
          {layer.title}
        </h3>
      </div>
      <p className="text-sm leading-6 text-paper/62">{layer.body}</p>
      <code className="min-w-0 border border-paper/15 bg-black/20 px-3 py-2 font-mono text-xs leading-5 text-paper/55">
        {layer.code}
      </code>
    </div>
  );
}

function HarnessSection() {
  return (
    <section id="harness" className="relative overflow-hidden border-y border-paper/15">
      <SectionGrid className="opacity-[0.05]" />
      <PageContainer className="relative z-10 grid min-w-0 gap-10 py-20">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div className="min-w-0">
            <h2 className="max-w-4xl font-heading text-5xl uppercase leading-none sm:text-6xl">
              Agent Harness
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-7 text-paper/65">
              The harness is the product argument: Murdock is not betting the
              case workflow on prompt obedience. It separates reading from
              validation, validation from consequences, and consequences from
              durable operations.
            </p>
          </div>
          <div className="grid gap-3 border-l border-paper/25 pl-5 font-mono text-sm leading-7 text-paper/65">
            <p>Model reads.</p>
            <p>Harness validates.</p>
            <p>Subagents execute scoped tasks.</p>
            <p>App gates.</p>
            <p>Queue preserves follow-through.</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_24rem]">
          <div className="min-w-0 border border-paper/20 bg-paper/[0.018] px-5">
            {harnessLayers.map((layer) => (
              <HarnessLayerRow key={layer.title} layer={layer} />
            ))}
          </div>

          <div className="grid min-w-0 gap-4">
            <div className="border border-paper/20 bg-paper/[0.018] p-5">
              <div className="mb-4 flex items-center gap-3">
                <Database
                  aria-hidden
                  className="size-4 text-paper/55"
                  strokeWidth={1.6}
                />
                <h3 className="font-heading text-2xl uppercase leading-none text-paper">
                  Operating spine
                </h3>
              </div>
              <div className="grid gap-4">
                {operatingRules.map((rule) => (
                  <div className="border-t border-paper/12 pt-4" key={rule.label}>
                    <p className="font-heading text-lg uppercase leading-none text-paper/85">
                      {rule.label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-paper/58">
                      {rule.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-paper/20 bg-paper/[0.018] p-5">
              <p className="font-heading text-2xl uppercase leading-none text-paper">
                Why this matters
              </p>
              <p className="mt-4 text-sm leading-6 text-paper/62">
                A new upload, a changed document, or a follow-up review request
                does not reset the work. The system refreshes current state from
                the same ledger, so the UI, subagents, and connector agents see
                the same review memory.
              </p>
            </div>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}

function WorkflowStepCard({
  index,
  step,
}: {
  index: number;
  step: WorkflowStep;
}) {
  const Icon = step.icon;

  return (
    <div className="relative grid min-h-0 gap-5 border border-paper/20 bg-paper/[0.018] p-5">
      <div className="flex items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-heading text-3xl uppercase leading-none text-paper/45">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="font-heading text-3xl uppercase leading-none text-paper">
            {step.title}
          </h3>
        </div>
        <Icon aria-hidden className="size-5 shrink-0 text-paper/55" strokeWidth={1.5} />
      </div>
      <p className="min-h-12 text-sm leading-6 text-paper/60">{step.detail}</p>
      <div className="grid border-t border-paper/15">
        {step.rows.map((row) => (
          <div
            className="flex items-center gap-3 border-b border-paper/10 py-3 text-sm text-paper/70 last:border-b-0"
            key={row}
          >
            <span className="size-1.5 shrink-0 bg-paper/55" />
            <span>{row}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductMockup() {
  return (
    <div className="relative w-full min-w-0 max-w-full overflow-hidden border border-paper/25 bg-ink/95 shadow-2xl shadow-black/40">
      <div className="flex h-12 items-center justify-between border-b border-paper/15 px-4">
        <span className="font-heading text-2xl uppercase leading-none text-paper">
          Murdock
        </span>
        <span className="size-6 border border-paper/20" />
      </div>

      <div className="grid min-h-[42rem] min-w-0 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-paper/15 p-4 lg:block">
          <div className="mb-5 flex items-center justify-between">
            <p className="font-heading text-2xl uppercase leading-none text-paper">
              Cases
            </p>
            <span className="border border-paper/20 px-2 py-1 text-xs text-paper/55">
              02
            </span>
          </div>
          <div className="mb-3 border border-paper/20 px-3 py-2 text-xs text-paper/75">
            + Add case
          </div>
          {["Immigration Case", "Bankruptcy Case"].map((item, index) => (
            <div
              className={cn(
                "mb-2 flex min-w-0 items-center justify-between border px-3 py-2 text-xs",
                index === 0
                  ? "border-paper/35 bg-paper/[0.10] text-paper"
                  : "border-paper/15 text-paper/65",
              )}
              key={item}
            >
              <span className="truncate">{item}</span>
              <FileText aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
            </div>
          ))}
        </aside>

        <div className="grid min-w-0 grid-rows-[auto_1fr_auto]">
          <header className="flex min-w-0 items-start justify-between gap-4 p-4 lg:p-6">
            <div className="min-w-0">
              <h3 className="truncate font-heading text-4xl uppercase leading-none text-paper sm:text-5xl">
                Immigration Case
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-paper/55">
                Workspace state from I-589 intake packet, review gates, source
                evidence, and queued follow-through.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="inline-flex h-8 items-center gap-2 border border-paper/20 px-3 font-heading text-sm uppercase text-paper">
                <FileText aria-hidden className="size-3.5" strokeWidth={1.7} />
                Files
              </span>
              <span className="inline-flex h-8 items-center border border-paper bg-paper px-3 font-heading text-sm uppercase text-ink">
                Action Items
              </span>
            </div>
          </header>

          <div className="min-w-0 px-4 pb-4 lg:px-6">
            <div className="mb-3 grid gap-2 lg:grid-cols-3">
              {reviewItems.map((item, index) => (
                <div
                  className={cn(
                    "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border px-3 py-2 text-xs",
                    index === 0
                      ? "border-paper/35 bg-paper/[0.08] text-paper/85"
                      : "border-paper/15 bg-paper/[0.025] text-paper/55",
                  )}
                  key={item.title}
                >
                  <Circle aria-hidden className="size-3.5 text-paper/45" strokeWidth={1.6} />
                  <span className="truncate">{item.title}</span>
                  <ArrowRight
                    aria-hidden
                    className="size-3 rotate-180 text-paper/40"
                    strokeWidth={1.7}
                  />
                </div>
              ))}
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border border-paper/15 bg-paper/[0.025] px-3 py-2 text-xs text-paper/55">
                <Circle aria-hidden className="size-3.5 text-paper/45" strokeWidth={1.6} />
                <span className="truncate">Contact Information of Attorney</span>
                <span className="text-paper/35">queued</span>
              </div>
            </div>

            <div className="grid min-h-0 min-w-0 gap-3 lg:grid-cols-[0.78fr_1.22fr]">
              <section className="grid min-w-0 gap-3 border border-paper/15 bg-paper/[0.025] p-3">
                <div className="flex min-w-0 items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-5 text-paper">
                      {reviewItems[0].title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-paper/55">
                      {reviewItems[0].summary}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs underline underline-offset-4 text-paper/55">
                    Sources
                  </span>
                </div>
                <span className="w-fit border border-paper/20 px-2 py-1 text-xs text-paper/70">
                  {reviewItems[0].source}
                </span>
                <div className="grid gap-2">
                  <span className="text-xs text-paper/40">Recommended</span>
                  {reviewItems[0].choices.map((choice, index) => (
                    <div
                      className="flex min-w-0 items-center gap-3 border border-paper/15 px-3 py-2 text-xs text-paper/75"
                      key={choice}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center border border-paper/20 text-[11px] text-paper/55">
                        {index + 1}
                      </span>
                      <span className="truncate">{choice}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-paper/12 pt-3">
                  <span className="text-xs text-paper/45">Queue creates durable task memory.</span>
                  <Button className="hover-theme-invert h-8 shrink-0 rounded-none border-paper/15 bg-ink px-4 text-sm text-paper" variant="outline">
                    Queue
                  </Button>
                </div>
              </section>

              <section className="grid min-h-0 min-w-0 gap-3 lg:grid-cols-[1fr_15rem]">
                <div className="min-w-0 border border-paper/15 bg-paper/[0.025]">
                  <div className="flex min-w-0 items-center justify-between gap-4 border-b border-paper/15 px-3 py-2 text-xs text-paper/65">
                    <span className="truncate">I-589 intake packet.pdf</span>
                    <span className="shrink-0 text-paper/45">page 2 / 14</span>
                  </div>
                  <div className="grid min-h-[26rem] grid-cols-[3.25rem_minmax(0,1fr)]">
                    <div className="grid content-start gap-2 border-r border-paper/15 bg-black/20 p-2">
                      {[1, 2, 3, 4].map((page) => (
                        <div
                          className={cn(
                            "flex aspect-[3/4] items-center justify-center border bg-paper/[0.06] text-[10px] text-paper/45",
                            page === 2 ? "border-paper/85" : "border-paper/15",
                          )}
                          key={page}
                        >
                          {page}
                        </div>
                      ))}
                    </div>
                    <div className="bg-paper p-5 text-ink">
                      <div className="mb-4 flex items-center justify-between border-b border-ink/50 pb-2 font-serif text-xs font-semibold">
                        <span>Part 2. Information About You</span>
                        <span className="italic">(continued)</span>
                      </div>
                      <div className="grid gap-5 font-serif text-xs leading-5">
                        <div>
                          <p className="font-semibold">14. Signature of Attorney or Accredited Representative</p>
                          <p>If you are an attorney or accredited representative, you must sign and date this form.</p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_5rem]">
                            <div>
                              <p className="text-[10px]">Signature of Attorney or Accredited Representative</p>
                              <div className="mt-1 h-8 border-2 border-dashed border-ink/80 bg-white" />
                            </div>
                            <div>
                              <p className="text-[10px]">Date</p>
                              <div className="mt-1 h-8 border border-ink/40 bg-white" />
                            </div>
                          </div>
                        </div>
                        <div>
                          <p className="font-semibold">15. Mailing Address of Client</p>
                          <p className="italic">Provide the mailing address where you would like to receive correspondence.</p>
                          <div className="mt-3 h-8 border border-ink/40 bg-white" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid min-w-0 content-start gap-3">
                  {[
                    ["Provenance", "Document page, quote, and span stay attached."],
                    ["Gate", "Missing signature requires human review."],
                    ["Queue", "Accepted next step remains visible until done."],
                    ["MCP", "Claude reads the digest, not raw case tables."],
                  ].map(([title, body]) => (
                    <div
                      className="border border-paper/15 bg-paper/[0.025] p-3"
                      key={title}
                    >
                      <p className="font-heading text-lg uppercase leading-none text-paper">
                        {title}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-paper/55">{body}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <div className="border-t border-paper/15 px-4 py-3 lg:px-6">
            <div className="mx-auto flex min-w-0 max-w-2xl items-center gap-3 border border-paper/15 bg-paper/[0.018] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-paper/45">
                Ask from the current case context...
              </span>
              <span className="flex size-7 shrink-0 items-center justify-center bg-paper text-sm text-ink">
                ↑
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaudeMark() {
  return (
    // Local copy of Wikimedia Commons File:Claude_AI_symbol.svg.
    <Image
      alt=""
      aria-hidden="true"
      className="size-8 shrink-0 opacity-85"
      height={32}
      src="/claude-ai-symbol.svg"
      width={32}
    />
  );
}

export default function PublicHomePage() {
  return (
    <main className="h-screen overflow-x-hidden overflow-y-auto bg-ink text-paper [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <PageContainer className="flex min-h-screen flex-col">
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-paper/15">
          <Link href="/" className="font-heading text-3xl uppercase leading-none">
            Murdock
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-paper/70 md:flex">
            <Link href="#problem">Problem</Link>
            <Link href="#workflow">Workflow</Link>
            <Link href="#harness">Harness</Link>
            <Link href="#proof">Proof</Link>
            <Link href="https://github.com/dunkeln/murdock">GitHub</Link>
          </nav>
          <Button
            asChild
            className="rounded-none bg-paper text-ink hover:bg-paper/90"
          >
            <Link href="/dashboard">Enter app</Link>
          </Button>
        </header>

        <section className="relative flex flex-1 flex-col justify-center gap-10 overflow-hidden py-16">
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 opacity-30 [background-image:linear-gradient(to_right,var(--color-paper)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-paper)_1px,transparent_1px)] [background-size:2rem_2rem]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--color-ink)_70%)]"
          />
          <div className="relative z-10 grid gap-8 border-b border-paper/15 pb-12 lg:grid-cols-[1fr_20rem] lg:items-end">
            <h1 className="font-heading text-7xl uppercase leading-[0.84] text-paper sm:text-8xl lg:text-[10rem]">
              Legal work deserves fewer handoffs
            </h1>
            <p className="max-w-sm text-lg leading-7 text-paper/70">
              A provenance-first workspace for finding what is missing, proving
              where it came from, and turning review decisions into follow-up
              work.
            </p>
          </div>

          <div className="relative z-10 grid gap-6 text-sm leading-6 text-paper/70 md:grid-cols-3">
            {heroProofPoints.map((point) => (
              <p key={point}>{point}</p>
            ))}
          </div>
          <p className="relative z-10 text-xs uppercase tracking-[0.18em] text-paper/35">
            Working MVP, live workflow surface, seeded legal review case.
          </p>
        </section>
      </PageContainer>

      <section id="problem" className="relative overflow-hidden border-y border-paper/15">
        <SectionGrid />
        <PageContainer className="relative z-10 grid min-w-0 gap-10 py-20 lg:grid-cols-[0.75fr_1.25fr]">
          <h2 className="font-heading text-5xl uppercase leading-none sm:text-6xl">
            The messy reality of legal work
          </h2>
          <div className="grid min-w-0 gap-6 text-xl leading-8 text-paper/75">
            <p>
              Reviewers lose time hunting across PDFs, notes, chats, and
              follow-ups. Documents change. Missing signatures, unsupported
              facts, and next-step decisions get passed between people, files,
              and memory.
            </p>
            <p>
              Murdock keeps source material intact, then keeps the document,
              finding, source evidence, human decision, and queue in one
              workspace.
            </p>
            <p className="text-base leading-7 text-paper/55">
              The point is not generic AI for law. The point is a workflow harness
              where the model drafts, the app validates, humans resolve, and
              the queue preserves follow-through.
            </p>
          </div>
        </PageContainer>
      </section>

      <section id="workflow" className="relative overflow-hidden">
        <SectionGrid />
        <PageContainer className="relative z-10 grid min-w-0 gap-10 py-20">
          <div className="grid min-w-0 gap-8 lg:grid-cols-[1fr_20rem] lg:items-end">
            <div className="min-w-0">
              <h2 className="max-w-4xl font-heading text-5xl uppercase leading-none sm:text-6xl">
                From messy intake to reviewable work
              </h2>
              <p className="mt-5 max-w-3xl text-lg leading-7 text-paper/65">
                Documents stay source-of-truth while source spans, review gates,
                MCP access, subagents, and benchmarked queues become the
                operational layer around them.
              </p>
            </div>
            <div className="border-l border-paper/30 pl-5 font-mono text-sm leading-7 text-paper/70">
              <p>The model drafts.</p>
              <p>The app validates.</p>
              <p>Humans resolve.</p>
            </div>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-4">
            {workflowSteps.map((step, index) => (
              <div className="relative" key={step.title}>
                <WorkflowStepCard index={index} step={step} />
                {index < workflowSteps.length - 1 ? (
                  <div
                    aria-hidden="true"
                    className="absolute right-[-1.25rem] top-10 z-20 hidden w-6 border-t border-paper/35 lg:block"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </PageContainer>
      </section>

      <HarnessSection />

      <section id="proof" className="relative overflow-hidden border-y border-paper/15">
        <SectionGrid className="opacity-[0.06]" />
        <PageContainer className="relative z-10 grid min-w-0 gap-10 py-20">
          <div className="grid min-w-0 gap-8 lg:grid-cols-[1fr_24rem] lg:items-end">
            <div className="min-w-0">
              <h2 className="max-w-4xl font-heading text-5xl uppercase leading-none sm:text-6xl">
                The review loop, in one surface
              </h2>
            <p className="mt-5 max-w-3xl text-lg leading-7 text-paper/65">
                A reviewer can see the case, the source page, the missing item,
                the recommended next step, and the queued follow-through without
                leaving the workspace.
              </p>
            </div>
            <p className="text-sm leading-6 text-paper/55">
              This mockup is code-native and seeded from the real workspace
              vocabulary: PDF context, review gates, source links, action
              choices, and queued follow-through.
            </p>
          </div>

          <div className="relative min-w-0">
            <ProductMockup />
            <div className="mt-4 grid gap-4 border border-paper/20 bg-paper/[0.018] p-4 md:grid-cols-[16rem_1fr] md:items-start">
              <div className="flex min-w-0 items-start gap-3">
                <ClaudeMark />
                <p className="font-heading text-2xl uppercase leading-none text-paper">
                  Claude Desktop-compatible MCP
                </p>
              </div>
              <div className="grid min-w-0 gap-4">
                <p className="text-sm leading-6 text-paper/65">
                  Work from Claude Desktop, with Murdock as the case source.
                  Murdock exposes a bounded MCP connector so Claude can retrieve
                  case review digests, source evidence, and queued action items
                  without raw database access or transcript dumping.
                </p>
                <div>
                  <ClaudeConnectorCopy />
                </div>
              </div>
            </div>
          </div>
        </PageContainer>
      </section>

      <section className="relative overflow-hidden">
        <SectionGrid />
        <PageContainer className="relative z-10 grid min-w-0 gap-10 py-20">
          <div className="grid min-w-0 gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <div className="min-w-0">
              <h2 className="font-heading text-5xl uppercase leading-none sm:text-6xl">
                Estimated up to 60% less first-pass review time
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-7 text-paper/65">
                Murdock targets the time reviewers lose moving between source
                lookup, issue notation, and next-step routing.
              </p>
            </div>
            <div className="grid gap-5 text-lg leading-8 text-paper/70">
              <p>
                First-pass review time is usually spent reading the packet,
                hunting for the supporting page, writing down what is missing,
                and routing the next step. Murdock compresses the search,
                notation, and handoff work so the reviewer spends more time
                verifying and deciding.
              </p>
              <div className="grid gap-3 border-l border-paper/25 pl-5 font-mono text-sm leading-7 text-paper/65">
                <p>manual review = read + search + note + route</p>
                <p>Murdock review = verify + decide + queue</p>
                <p>saved time = search + note + routing drag</p>
              </div>
              <p className="text-xs leading-5 text-paper/38">
                Validation path: time representative matters before and after
                Murdock, then report median reduction, range, correction rate,
                and missed-issue rate.
              </p>
            </div>
          </div>
        </PageContainer>
      </section>

      <section id="contact" className="relative overflow-hidden border-t border-paper/15">
        <SectionGrid />
        <PageContainer className="relative z-10 grid min-w-0 gap-10 py-20 lg:grid-cols-[1fr_24rem] lg:items-end">
          <h2 className="max-w-4xl font-heading text-6xl uppercase leading-none sm:text-7xl">
            Built for the handoffs that slow legal work down
          </h2>
          <div className="grid min-w-0 gap-6">
            <p className="text-lg leading-7 text-paper/65">
              Less hunting. Fewer missed items. Cleaner handoffs. The goal is
              lower cycle time with provenance, human gates, and a clear audit
              trail.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                className="rounded-none bg-paper px-6 text-ink hover:bg-paper/90"
              >
                <Link href="/dashboard">Enter app</Link>
              </Button>
              <Button
                asChild
                className="hover-theme-invert rounded-none border-paper/25 bg-ink px-6 text-paper"
                variant="outline"
              >
                <Link href="#workflow">Read the workflow</Link>
              </Button>
              <Button
                asChild
                className="hover-theme-invert rounded-none border-paper/25 bg-ink px-6 text-paper"
                variant="outline"
              >
                <Link href="https://github.com/dunkeln/murdock">GitHub</Link>
              </Button>
            </div>
          </div>
        </PageContainer>
      </section>
    </main>
  );
}
