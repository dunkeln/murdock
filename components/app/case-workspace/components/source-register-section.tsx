import { FileText } from "lucide-react";

import type { CaseWorkspaceSourceDocumentDto } from "@/lib/contracts/case-workspace";

import { EmptySection } from "./empty-section";
import { formatWorkspaceDate } from "./formatters";

type SourceRegisterSectionProps = {
  sourceDocuments: CaseWorkspaceSourceDocumentDto[];
};

export function SourceRegisterSection({
  sourceDocuments,
}: SourceRegisterSectionProps) {
  return (
    <section className="flex min-w-0 flex-col gap-4 pb-8">
      <div className="flex items-center gap-2">
        <FileText aria-hidden="true" />
        <h2 className="font-heading text-3xl uppercase leading-none">
          Source register
        </h2>
      </div>
      {sourceDocuments.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {sourceDocuments.map((sourceDocument) => (
            <article
              className="grid min-w-0 gap-3 border border-paper/15 p-4 text-sm lg:grid-cols-[minmax(0,1fr)_8rem]"
              key={sourceDocument.id}
            >
              <div className="min-w-0">
                <h3 className="truncate font-medium text-paper">
                  {sourceDocument.title}
                </h3>
                <p className="truncate text-paper/55">
                  {sourceDocument.fileName}
                </p>
              </div>
              <div className="text-left text-paper/55 lg:text-right">
                <p className="uppercase">{sourceDocument.sourceKind}</p>
                <p>{formatWorkspaceDate(sourceDocument.sourceDate)}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptySection label="No source documents yet." />
      )}
    </section>
  );
}
