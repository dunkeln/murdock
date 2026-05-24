import { Fingerprint } from "lucide-react";

import type {
  CaseWorkspaceFactDto,
  CaseWorkspaceSourceDocumentDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";
import { cn } from "@/lib/utils";

import { EmptySection } from "./empty-section";
import { SourceReferenceList } from "./source-reference-list";

type ContextRegisterSectionProps = {
  facts: CaseWorkspaceFactDto[];
  sourceDocumentsById: Map<string, CaseWorkspaceSourceDocumentDto>;
  sourceSpansById: Map<string, CaseWorkspaceSourceSpanDto>;
};

export function ContextRegisterSection({
  facts,
  sourceDocumentsById,
  sourceSpansById,
}: ContextRegisterSectionProps) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-2">
        <Fingerprint aria-hidden="true" />
        <h2 className="font-heading text-3xl uppercase leading-none">
          Context register
        </h2>
      </div>
      {facts.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {facts.map((fact) => (
            <article
              className={cn(
                "flex min-w-0 flex-col gap-3 border border-paper/15 p-4",
                !fact.isCurrent && "text-paper/55"
              )}
              key={fact.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-paper">{fact.label}</h3>
                  <p className="text-xs uppercase text-paper/45">
                    {fact.categoryDetail ?? fact.category}
                  </p>
                </div>
                <span className="shrink-0 text-xs uppercase text-paper/45">
                  {fact.isCurrent ? "Current" : "Superseded"}
                </span>
              </div>
              <dl className="grid gap-2 text-sm">
                <div>
                  <dt className="text-paper/45">Stated</dt>
                  <dd className="text-paper/80">
                    {fact.statedValue ?? "Not stated"}
                  </dd>
                </div>
                <div>
                  <dt className="text-paper/45">Normalized</dt>
                  <dd className="text-paper/80">
                    {fact.normalizedValue ?? "Not normalized"}
                  </dd>
                </div>
              </dl>
              <SourceReferenceList
                sourceDocumentsById={sourceDocumentsById}
                sourceSpansById={sourceSpansById}
                spanIds={fact.sourceSpanIds}
              />
            </article>
          ))}
        </div>
      ) : (
        <EmptySection label="No contextual facts yet." />
      )}
    </section>
  );
}
