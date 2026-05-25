"use client";

import { PdfViewer, type PdfPageMarker } from "@/components/app/pdf-viewer";
import { cn } from "@/lib/utils";

type CaseSourceSurfaceProps = {
  activeMarkerId?: string | null;
  className?: string;
  documentName?: string;
  markers?: PdfPageMarker[];
  onMarkerSelect?: (markerId: string) => void;
  selectedFile?: File | null;
  sourceUrl?: string | null;
};

export function CaseSourceSurface({
  activeMarkerId,
  className,
  documentName,
  markers,
  onMarkerSelect,
  selectedFile = null,
  sourceUrl = null,
}: CaseSourceSurfaceProps) {
  const canRenderPdf = Boolean(selectedFile || sourceUrl);

  return (
    <section
      className={cn(
        "flex min-h-[34rem] min-w-0 max-w-full flex-col overflow-hidden xl:min-h-0",
        className,
      )}
      data-case-source-surface
    >
      <div className="min-h-[26rem] min-w-0 max-w-full flex-1 overflow-hidden">
        {canRenderPdf ? (
          <PdfViewer
            activeMarkerId={activeMarkerId}
            file={selectedFile}
            label={documentName}
            markers={markers}
            onMarkerSelect={onMarkerSelect}
            sourceUrl={sourceUrl}
          />
        ) : (
          <div className="flex h-full min-h-[26rem] items-center justify-center border border-paper/15 px-6 text-center text-sm text-paper/55">
            Source preview is not loaded for {documentName ?? "this document"}.
          </div>
        )}
      </div>
    </section>
  );
}
