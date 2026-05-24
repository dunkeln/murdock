import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  GitCompare,
  HeartPulse,
} from "lucide-react";

import {
  caseWorkspaceIssueSeverityLabels,
  getCaseWorkspaceAttentionItems,
  getCaseWorkspaceCurrentState,
  getCaseWorkspaceMomentumItems,
  type CaseWorkspaceReadinessTone,
} from "@/lib/case-workspace";
import type {
  CaseWorkspaceDto,
  CaseWorkspaceSourceDocumentDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";
import { cn } from "@/lib/utils";

import { formatWorkspaceDate } from "./formatters";
import { SourceReferenceList } from "./source-reference-list";

type CaseHeartbeatSectionProps = {
  workspace: CaseWorkspaceDto;
  sourceDocumentsById: Map<string, CaseWorkspaceSourceDocumentDto>;
  sourceSpansById: Map<string, CaseWorkspaceSourceSpanDto>;
};

const readinessClasses = {
  blocked: "bg-paper text-ink",
  attention: "border-paper/45 text-paper",
  ready: "border-paper/25 text-paper/75",
} satisfies Record<CaseWorkspaceReadinessTone, string>;

const readinessIcons = {
  blocked: AlertTriangle,
  attention: GitCompare,
  ready: CheckCircle2,
} satisfies Record<CaseWorkspaceReadinessTone, typeof AlertTriangle>;

function formatDeadline(deadline: string | null) {
  return deadline ? formatWorkspaceDate(deadline) : "Not set";
}

export function CaseHeartbeatSection({
  workspace,
  sourceDocumentsById,
  sourceSpansById,
}: CaseHeartbeatSectionProps) {
  const currentState = getCaseWorkspaceCurrentState(workspace);
  const attentionItems = getCaseWorkspaceAttentionItems(workspace, 2);
  const momentumItems = getCaseWorkspaceMomentumItems(workspace);
  const ReadinessIcon = readinessIcons[currentState.readinessTone];

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <article className="flex min-w-0 flex-col gap-5 border border-paper/20 bg-paper/[0.03] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2 text-paper/55">
                <HeartPulse aria-hidden="true" />
                <p className="text-xs uppercase">Case heartbeat</p>
              </div>
              <h2 className="max-w-2xl font-heading text-4xl uppercase leading-none text-paper">
                {currentState.readinessLabel}
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-paper/70">
                {currentState.readinessDetail}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex w-fit shrink-0 items-center gap-2 border px-3 py-2 text-xs uppercase",
                readinessClasses[currentState.readinessTone]
              )}
            >
              <ReadinessIcon aria-hidden="true" />
              {currentState.phaseLabel}
            </span>
          </div>

          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="border border-paper/10 px-3 py-3">
              <dt className="text-xs uppercase text-paper/45">Open issues</dt>
              <dd className="mt-2 font-heading text-3xl leading-none text-paper">
                {currentState.openIssueCount}
              </dd>
            </div>
            <div className="border border-paper/10 px-3 py-3">
              <dt className="text-xs uppercase text-paper/45">
                Contradictions
              </dt>
              <dd className="mt-2 font-heading text-3xl leading-none text-paper">
                {currentState.contradictionCount}
              </dd>
            </div>
            <div className="border border-paper/10 px-3 py-3">
              <dt className="text-xs uppercase text-paper/45">Next deadline</dt>
              <dd className="mt-2 text-sm font-medium text-paper">
                {formatDeadline(currentState.nextDeadlineAt)}
              </dd>
            </div>
          </dl>
        </article>

        {attentionItems.length > 0 ? (
          <section className="flex min-w-0 flex-col gap-3">
            <p className="text-xs uppercase text-paper/45">Needs attention</p>
            <div className="grid gap-3 lg:grid-cols-2">
              {attentionItems.map((item) => (
                <article
                  className="flex min-w-0 flex-col gap-3 border border-paper/15 p-4"
                  key={item.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs uppercase text-paper/45">
                        {item.label}
                      </p>
                      <h3 className="mt-1 text-base font-medium text-paper">
                        {item.title}
                      </h3>
                    </div>
                    <span className="shrink-0 border border-paper/20 px-2 py-1 text-xs uppercase text-paper/60">
                      {caseWorkspaceIssueSeverityLabels[item.severity]}
                    </span>
                  </div>
                  {item.action ? (
                    <p className="text-sm leading-6 text-paper/70">
                      {item.action}
                    </p>
                  ) : null}
                  <SourceReferenceList
                    sourceDocumentsById={sourceDocumentsById}
                    sourceSpansById={sourceSpansById}
                    spanIds={item.sourceSpanIds}
                  />
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4">
        <article className="flex min-w-0 flex-col gap-3 border border-paper/15 p-4">
          <div className="flex items-center gap-2 text-paper/55">
            <CalendarClock aria-hidden="true" />
            <p className="text-xs uppercase">What changed</p>
          </div>
          {currentState.latestChange ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-paper/55">
                {formatWorkspaceDate(currentState.latestChange.occurredAt)}
              </p>
              <h3 className="text-base font-medium text-paper">
                {currentState.latestChange.title}
              </h3>
              {currentState.latestChange.description ? (
                <p className="text-sm leading-6 text-paper/65">
                  {currentState.latestChange.description}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm leading-6 text-paper/65">
              No source-backed changes have been recorded yet.
            </p>
          )}
        </article>

        <article className="flex min-w-0 flex-col gap-3 border border-paper/15 p-4">
          <div className="flex items-center gap-2 text-paper/55">
            <ArrowRight aria-hidden="true" />
            <p className="text-xs uppercase">Next work</p>
          </div>
          {momentumItems.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {momentumItems.map((item) => (
                <li className="flex min-w-0 flex-col gap-1" key={item.id}>
                  <p className="text-xs uppercase text-paper/45">
                    {item.label}
                  </p>
                  <p className="font-medium text-paper">{item.title}</p>
                  {item.detail ? (
                    <p className="text-sm leading-6 text-paper/65">
                      {item.id === "case-next-deadline"
                        ? formatWorkspaceDate(item.detail)
                        : item.detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm leading-6 text-paper/65">
              No next work item is currently recorded.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}
