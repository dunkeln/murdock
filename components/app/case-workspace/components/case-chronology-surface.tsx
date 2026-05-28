"use client";

import * as React from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  CaseWorkspaceChronologyEventDto,
  CaseWorkspaceSourceDocumentDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";
import { cn } from "@/lib/utils";

import {
  ReviewItemSourcesModal,
  type ReviewItemSourceModalSource,
} from "./review-item-sources-modal";

type CaseChronologySurfaceProps = {
  className?: string;
  events: CaseWorkspaceChronologyEventDto[];
  sourceDocuments: CaseWorkspaceSourceDocumentDto[];
  sourceSpans: CaseWorkspaceSourceSpanDto[];
};

type ChronologyItem = {
  confidence: number | null;
  description: string | null;
  id: string;
  occurredAt: string | null;
  occurredAtPrecision: CaseWorkspaceChronologyEventDto["occurredAtPrecision"];
  sources: ReviewItemSourceModalSource[];
  title: string;
};

function compareChronologyItems(left: ChronologyItem, right: ChronologyItem) {
  if (left.occurredAt && right.occurredAt) {
    return left.occurredAt.localeCompare(right.occurredAt);
  }

  if (left.occurredAt) {
    return -1;
  }

  if (right.occurredAt) {
    return 1;
  }

  return left.title.localeCompare(right.title);
}

function dateLabel(item: ChronologyItem) {
  if (!item.occurredAt || item.occurredAtPrecision === "unknown") {
    return "Undated";
  }

  const date = new Date(item.occurredAt);

  if (Number.isNaN(date.getTime())) {
    return "Undated";
  }

  if (item.occurredAtPrecision === "month") {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    }).format(date);
  }

  if (item.occurredAtPrecision === "exact") {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function sourceModalSourcesForEvent(input: {
  event: CaseWorkspaceChronologyEventDto;
  sourceDocuments: CaseWorkspaceSourceDocumentDto[];
  sourceSpans: CaseWorkspaceSourceSpanDto[];
}): ReviewItemSourceModalSource[] {
  const spanById = new Map(input.sourceSpans.map((span) => [span.id, span]));
  const documentById = new Map(
    input.sourceDocuments.map((document) => [document.id, document]),
  );
  const sourcesByDocumentId = new Map<string, ReviewItemSourceModalSource>();

  for (const spanId of input.event.sourceSpanIds) {
    const span = spanById.get(spanId);

    if (!span) {
      continue;
    }

    const sourceDocument = documentById.get(span.sourceDocumentId);
    const existingSource = sourcesByDocumentId.get(span.sourceDocumentId);
    const pageLabel = span.pageLabel ? `p. ${span.pageLabel}` : null;

    if (existingSource) {
      if (pageLabel && !existingSource.pageLabels.includes(pageLabel)) {
        existingSource.pageLabels.push(pageLabel);
      }

      continue;
    }

    sourcesByDocumentId.set(span.sourceDocumentId, {
      fileName: sourceDocument?.fileName ?? "Source document",
      id: span.sourceDocumentId,
      pageLabels: pageLabel ? [pageLabel] : [],
      sourceUrl: sourceDocument?.caseDocumentId
        ? `/case-documents/${sourceDocument.caseDocumentId}`
        : null,
    });
  }

  return Array.from(sourcesByDocumentId.values());
}

function chronologyItems(input: CaseChronologySurfaceProps): ChronologyItem[] {
  return input.events
    .map((event) => ({
      confidence: event.confidence,
      description: event.description,
      id: event.id,
      occurredAt: event.occurredAt,
      occurredAtPrecision: event.occurredAtPrecision,
      sources: sourceModalSourcesForEvent({
        event,
        sourceDocuments: input.sourceDocuments,
        sourceSpans: input.sourceSpans,
      }),
      title: event.title,
    }))
    .sort(compareChronologyItems);
}

export function CaseChronologySurface({
  className,
  events,
  sourceDocuments,
  sourceSpans,
}: CaseChronologySurfaceProps) {
  const items = React.useMemo(
    () => chronologyItems({ events, sourceDocuments, sourceSpans }),
    [events, sourceDocuments, sourceSpans],
  );

  return (
    <section className={cn("min-h-0 text-sm text-paper", className)}>
      <ScrollArea className="min-h-0 flex-1 px-4 py-3 [&_[data-slot=scroll-area-scrollbar]]:hidden">
        {items.length === 0 ? (
          <div className="border border-paper/15 px-3 py-2 text-xs text-paper/55">
            No documented timeline yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <article
                className="grid gap-3 border border-paper/15 bg-paper/[0.02] px-4 py-3.5"
                data-case-chronology-event={item.id}
                key={item.id}
              >
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-xs leading-none text-paper/45">
                      {dateLabel(item)}
                    </span>
                    <h2 className="mt-2 text-sm font-medium leading-5 text-paper">
                      {item.title}
                    </h2>
                  </div>
                  <ReviewItemSourcesModal
                    sources={item.sources}
                    triggerClassName="shrink-0"
                  />
                </div>
                {item.description ? (
                  <p className="text-xs italic leading-5 text-paper/65">
                    {item.description}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </ScrollArea>
    </section>
  );
}
