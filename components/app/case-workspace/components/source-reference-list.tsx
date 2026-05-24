import { Quote } from "lucide-react";

import type {
  CaseWorkspaceSourceDocumentDto,
  CaseWorkspaceSourceSpanDto,
} from "@/lib/contracts/case-workspace";

import {
  formatWorkspaceConfidence,
  formatWorkspaceDate,
  getSourceSpanCitationLabel,
} from "./formatters";

type SourceReferenceListProps = {
  sourceDocumentsById: Map<string, CaseWorkspaceSourceDocumentDto>;
  sourceSpansById: Map<string, CaseWorkspaceSourceSpanDto>;
  spanIds: string[];
};

export function SourceReferenceList({
  sourceDocumentsById,
  sourceSpansById,
  spanIds,
}: SourceReferenceListProps) {
  const spans = spanIds
    .map((spanId) => sourceSpansById.get(spanId))
    .filter((span): span is CaseWorkspaceSourceSpanDto => Boolean(span));

  if (spans.length === 0) {
    return null;
  }

  return (
    <details className="group min-w-0 overflow-hidden border border-paper/15 bg-ink text-sm text-paper/70">
      <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-paper transition-colors hover:bg-paper/10 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Quote data-icon="inline-start" />
          <span className="truncate">
            Evidence · {spans.length} cited excerpt
            {spans.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="shrink-0 text-xs uppercase text-paper/45">
          Inspect
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-paper/15 px-3 py-3">
        {spans.map((span) => {
          const sourceDocument = sourceDocumentsById.get(
            span.sourceDocumentId
          );

          return (
            <article className="flex min-w-0 flex-col gap-3" key={span.id}>
              <div className="flex min-w-0 items-start justify-between gap-3 text-xs uppercase text-paper/45">
                <p className="min-w-0 truncate">
                  {sourceDocument?.title ?? "Source document"} ·{" "}
                  {getSourceSpanCitationLabel(span)}
                </p>
                <p className="shrink-0">
                  {formatWorkspaceConfidence(span.confidence)}
                </p>
              </div>
              <blockquote className="border-l border-paper/30 pl-3 leading-6 text-paper">
                {span.verbatimExcerpt}
              </blockquote>
              <dl className="grid min-w-0 gap-2 text-xs text-paper/55 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="uppercase">File</dt>
                  <dd className="break-all text-paper/75">
                    {sourceDocument?.fileName ?? "Unknown"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="uppercase">Source ID</dt>
                  <dd className="break-all text-paper/75">{span.id}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="uppercase">OCR</dt>
                  <dd className="break-all text-paper/75">
                    {sourceDocument?.ocrConversionId ?? "Not linked"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="uppercase">Captured</dt>
                  <dd className="text-paper/75">
                    {formatWorkspaceDate(span.capturedAt)}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </details>
  );
}
