"use client";

import type { CaseControlDto } from "@/lib/case-control";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";

import { CaseControlPanel } from "./case-control-panel";
import {
  CaseSourceSurface,
  type CaseSourceSurfaceMode,
} from "./case-source-surface";
import { DocumentRevisionList } from "./document-revision-list";

type CaseFileReviewSurfaceProps = {
  activeReviewItemId?: string | null;
  className?: string;
  control: CaseControlDto;
  documentName?: string;
  mode?: CaseFileReviewSurfaceMode;
  onActiveReviewItemChange?: (itemId: string | null) => void;
  previewedFile?: File | null;
  revisions: DocumentRevisionSummaryDto[];
  sourceUrl?: string | null;
};

export type CaseFileReviewSurfaceMode = CaseSourceSurfaceMode;

export function CaseFileReviewSurface({
  activeReviewItemId,
  className,
  control,
  documentName,
  mode = "contained",
  onActiveReviewItemChange,
  previewedFile = null,
  revisions,
  sourceUrl = null,
}: CaseFileReviewSurfaceProps) {
  const showDocumentUpdates = revisions.length > 0;
  const showReviewActions = control.queue.length > 0;
  const overlay = showDocumentUpdates || showReviewActions
    ? (
        <div
          className="flex h-full min-h-0 flex-col justify-between gap-3 overflow-hidden"
          data-case-file-review-overlay
        >
          {showDocumentUpdates ? (
            <DocumentRevisionList
              className="max-h-[40%] shrink-0 overflow-y-auto pr-1"
              revisions={revisions}
            />
          ) : null}
          {showReviewActions ? (
            <CaseControlPanel
              activeReviewItemId={activeReviewItemId}
              className="min-h-0 max-h-[58%] shrink-0"
              control={control}
              onActiveReviewItemChange={onActiveReviewItemChange}
              variant="overlay"
            />
          ) : null}
        </div>
      )
    : null;

  return (
    <CaseSourceSurface
      className={className}
      documentName={documentName}
      mode={mode}
      overlay={overlay}
      previewedFile={previewedFile}
      sourceUrl={sourceUrl}
    />
  );
}
