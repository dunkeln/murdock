import { GitCompare } from "lucide-react";

import {
  caseWorkspaceIssueSeverityLabels,
  groupCaseWorkspaceIssuesByType,
} from "@/lib/case-workspace";
import type {
  CaseWorkspaceIssueDto,
  CaseWorkspaceIssueSeverity,
  CaseWorkspaceSourceDocumentDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";
import { cn } from "@/lib/utils";

import { EmptySection } from "./empty-section";
import { SourceReferenceList } from "./source-reference-list";

type OperationalIssuesSectionProps = {
  issues: CaseWorkspaceIssueDto[];
  sourceDocumentsById: Map<string, CaseWorkspaceSourceDocumentDto>;
  sourceSpansById: Map<string, CaseWorkspaceSourceSpanDto>;
};

const severityClasses = {
  high: "bg-paper text-ink",
  medium: "border-paper/40 text-paper",
  low: "border-paper/20 text-paper/65",
} satisfies Record<CaseWorkspaceIssueSeverity, string>;

export function OperationalIssuesSection({
  issues,
  sourceDocumentsById,
  sourceSpansById,
}: OperationalIssuesSectionProps) {
  const issueGroups = groupCaseWorkspaceIssuesByType(issues);

  return (
    <section className="order-1 flex min-w-0 flex-col gap-4 xl:order-2">
      <div className="flex items-center gap-2">
        <GitCompare aria-hidden="true" />
        <h2 className="font-heading text-3xl uppercase leading-none">
          Operational issues
        </h2>
      </div>
      {issueGroups.length > 0 ? (
        <div className="flex flex-col gap-5">
          {issueGroups.map((group) => (
            <div className="flex flex-col gap-3" key={group.issueType}>
              <p className="text-xs uppercase text-paper/45">{group.label}</p>
              {group.issues.map((issue) => (
                <article
                  className="flex min-w-0 flex-col gap-3 border border-paper/15 p-4"
                  key={issue.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-medium text-paper">
                      {issue.title}
                    </h3>
                    <span
                      className={cn(
                        "shrink-0 border px-2 py-1 text-xs uppercase",
                        severityClasses[issue.severity]
                      )}
                    >
                      {caseWorkspaceIssueSeverityLabels[issue.severity]}
                    </span>
                  </div>
                  {issue.description ? (
                    <p className="text-sm leading-6 text-paper/65">
                      {issue.description}
                    </p>
                  ) : null}
                  {issue.provenanceSummary ? (
                    <p className="border-l border-paper/25 pl-3 text-sm leading-6 text-paper/70">
                      {issue.provenanceSummary}
                    </p>
                  ) : null}
                  <SourceReferenceList
                    sourceDocumentsById={sourceDocumentsById}
                    sourceSpansById={sourceSpansById}
                    spanIds={issue.sourceSpanIds}
                  />
                </article>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <EmptySection label="No surfaced issues yet." />
      )}
    </section>
  );
}
