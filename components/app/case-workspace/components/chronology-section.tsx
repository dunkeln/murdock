import { CalendarClock } from "lucide-react";

import type {
  CaseWorkspaceChronologyEventDto,
  CaseWorkspaceSourceDocumentDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";

import { EmptySection } from "./empty-section";
import { formatWorkspaceDate } from "./formatters";
import { SourceReferenceList } from "./source-reference-list";

type ChronologySectionProps = {
  events: CaseWorkspaceChronologyEventDto[];
  sourceDocumentsById: Map<string, CaseWorkspaceSourceDocumentDto>;
  sourceSpansById: Map<string, CaseWorkspaceSourceSpanDto>;
};

export function ChronologySection({
  events,
  sourceDocumentsById,
  sourceSpansById,
}: ChronologySectionProps) {
  return (
    <section className="order-2 flex min-w-0 flex-col gap-4 xl:order-1">
      <div className="flex items-center gap-2">
        <CalendarClock aria-hidden="true" />
        <h2 className="font-heading text-3xl uppercase leading-none">
          Chronology
        </h2>
      </div>
      {events.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {events.map((event) => (
            <li
              className="grid min-w-0 gap-4 border border-paper/15 p-4 lg:grid-cols-[9rem_minmax(0,1fr)]"
              key={event.id}
            >
              <div className="text-sm text-paper/55">
                {formatWorkspaceDate(event.occurredAt)}
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                <div>
                  <p className="font-medium text-paper">{event.title}</p>
                  {event.description ? (
                    <p className="mt-1 text-sm leading-6 text-paper/65">
                      {event.description}
                    </p>
                  ) : null}
                </div>
                <SourceReferenceList
                  sourceDocumentsById={sourceDocumentsById}
                  sourceSpansById={sourceSpansById}
                  spanIds={event.sourceSpanIds}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptySection label="No chronology records yet." />
      )}
    </section>
  );
}
