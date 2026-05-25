"use client";

import * as React from "react";
import type { CSSProperties, ReactNode } from "react";

import { PdfViewer } from "@/components/app/pdf-viewer";
import { cn } from "@/lib/utils";

type CaseSourceSurfaceProps = {
  className?: string;
  documentName?: string;
  mode?: CaseSourceSurfaceMode;
  onVisiblePageIndexChange?: (pageIndex: number | null) => void;
  overlay?: ReactNode;
  previewedFile?: File | null;
  sourceUrl?: string | null;
};

export type CaseSourceSurfaceMode = "contained" | "content";

const pdfStageWidthByMode = {
  contained: "70%",
  content: "65%",
} satisfies Record<CaseSourceSurfaceMode, `${number}%`>;

const pdfStageStyleByMode = {
  contained: { width: pdfStageWidthByMode.contained },
  content: { width: pdfStageWidthByMode.content },
} satisfies Record<CaseSourceSurfaceMode, CSSProperties>;

const controlOverlayStyleByMode = {
  contained: {
    left: pdfStageWidthByMode.contained,
    width: `calc(100% - ${pdfStageWidthByMode.contained})`,
  },
  content: {
    left: pdfStageWidthByMode.content,
    width: `calc(100% - ${pdfStageWidthByMode.content})`,
  },
} satisfies Record<CaseSourceSurfaceMode, CSSProperties>;

export function CaseSourceSurface({
  className,
  documentName,
  mode = "contained",
  onVisiblePageIndexChange,
  overlay,
  previewedFile = null,
  sourceUrl = null,
}: CaseSourceSurfaceProps) {
  const canRenderPdf = Boolean(previewedFile || sourceUrl);
  const scrollViewportRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const viewport = scrollViewportRef.current;

    if (!onVisiblePageIndexChange) {
      return;
    }

    const reportVisiblePageIndex: (pageIndex: number | null) => void =
      onVisiblePageIndexChange;

    if (!viewport || !canRenderPdf) {
      reportVisiblePageIndex(null);
      return;
    }

    const visibleViewport = viewport;
    let animationFrameId: number | null = null;

    function updateVisiblePage() {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        const viewportRect = visibleViewport.getBoundingClientRect();
        const pageFrames = Array.from(
          visibleViewport.querySelectorAll<HTMLElement>("[data-pdf-page-frame]"),
        );
        let visiblePageIndex: number | null = null;
        let largestVisibleHeight = 0;

        for (const pageFrame of pageFrames) {
          const pageNumber = Number(pageFrame.dataset.pdfPageFrame);

          if (!Number.isFinite(pageNumber)) {
            continue;
          }

          const pageRect = pageFrame.getBoundingClientRect();
          const visibleHeight = Math.max(
            0,
            Math.min(pageRect.bottom, viewportRect.bottom) -
              Math.max(pageRect.top, viewportRect.top),
          );

          if (visibleHeight > largestVisibleHeight) {
            largestVisibleHeight = visibleHeight;
            visiblePageIndex = pageNumber - 1;
          }
        }

        reportVisiblePageIndex(visiblePageIndex);
      });
    }

    const mutationObserver = new MutationObserver(updateVisiblePage);
    const resizeObserver = new ResizeObserver(updateVisiblePage);

    mutationObserver.observe(visibleViewport, { childList: true, subtree: true });
    resizeObserver.observe(visibleViewport);
    visibleViewport.addEventListener("scroll", updateVisiblePage, { passive: true });
    window.addEventListener("resize", updateVisiblePage);
    updateVisiblePage();

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      mutationObserver.disconnect();
      resizeObserver.disconnect();
      visibleViewport.removeEventListener("scroll", updateVisiblePage);
      window.removeEventListener("resize", updateVisiblePage);
    };
  }, [canRenderPdf, onVisiblePageIndexChange]);

  return (
    <section
      className={cn(
        "flex min-w-0 max-w-full flex-col",
        mode === "contained"
          ? "min-h-[34rem] overflow-hidden xl:min-h-0"
          : "h-auto items-start overflow-visible",
        className,
      )}
      data-case-source-surface
    >
      <div
        className={cn(
          "min-w-0 max-w-full overflow-hidden",
          mode === "contained"
            ? "min-h-[26rem] flex-1"
            : "h-auto w-full",
        )}
      >
        {canRenderPdf ? (
          <div
            className={cn(
              "relative min-w-0 max-w-full overflow-hidden p-0",
              mode === "contained"
                ? "h-full"
                : "max-h-[calc(100vh-20rem)]",
            )}
            data-pdf-scroll-container
          >
            <div
              className="h-full min-w-0 max-w-full overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-pdf-scroll-viewport
              ref={scrollViewportRef}
            >
              <div
                className="min-w-0 max-w-full"
                data-pdf-stage
                style={pdfStageStyleByMode[mode]}
              >
                <PdfViewer
                  file={previewedFile}
                  label={documentName}
                  sourceUrl={sourceUrl}
                />
              </div>
            </div>
            {overlay ? (
              <div
                className="pointer-events-none absolute inset-y-3 z-20"
                data-case-control-overlay
                style={controlOverlayStyleByMode[mode]}
              >
                <div className="pointer-events-auto h-full min-h-0">
                  {overlay}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div
            aria-label="Source preview unavailable"
            className="flex h-full min-h-[26rem] items-center justify-center border border-paper/15 px-6 text-center text-sm text-paper/55"
          >
            Preview unavailable
          </div>
        )}
      </div>
    </section>
  );
}
