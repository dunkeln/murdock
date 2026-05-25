"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export type PdfPageMarker = {
  id: string;
  label: string;
  pageIndex: number;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
};

type PdfViewerProps = {
  activeMarkerId?: string | null;
  file: File | null;
  label?: string;
  markers?: PdfPageMarker[];
  onMarkerSelect?: (markerId: string) => void;
  sourceUrl?: string | null;
};

type PdfDocumentProxy = Awaited<
  ReturnType<typeof import("pdfjs-dist").getDocument>["promise"]
>;

type PdfPageProps = {
  activeMarkerId?: string | null;
  markers: PdfPageMarker[];
  onMarkerSelect?: (markerId: string) => void;
  pageNumber: number;
  pdfDocument: PdfDocumentProxy;
};

type PdfRenderTask = {
  cancel: () => void;
  promise: Promise<unknown>;
};

function isRenderingCancelled(error: unknown) {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

function markerLabel(marker: PdfPageMarker) {
  return `${marker.label}. ${marker.title}`;
}

function PdfPage({
  activeMarkerId,
  markers,
  onMarkerSelect,
  pageNumber,
  pdfDocument,
}: PdfPageProps) {
  const [canvasWidth, setCanvasWidth] = React.useState(0);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setCanvasWidth(entry.contentRect.width);
    });

    observer.observe(canvas);
    setCanvasWidth(canvas.clientWidth);

    return () => {
      observer.disconnect();
    };
  }, []);

  React.useEffect(() => {
    let isCancelled = false;
    let renderTask: PdfRenderTask | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;

      if (!canvas || canvasWidth === 0) {
        return;
      }

      try {
        const page = await pdfDocument.getPage(pageNumber);
        const naturalViewport = page.getViewport({ scale: 1 });
        const scale = canvasWidth / naturalViewport.width;
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");

        if (!context || isCancelled) {
          return;
        }

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });

        await renderTask.promise;
      } catch (error) {
        if (!isCancelled && !isRenderingCancelled(error)) {
          throw error;
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
    };
  }, [canvasWidth, pageNumber, pdfDocument]);

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_1.75rem] items-start gap-1"
      data-pdf-page-frame={pageNumber}
    >
      <canvas
        className="w-full bg-white"
        data-pdf-page={pageNumber}
        ref={canvasRef}
      />
      <div
        aria-label={`Page ${pageNumber} review pins`}
        className="flex min-h-12 flex-col items-center gap-1 pt-2"
      >
        {markers.map((marker) => {
          const isActive = marker.id === activeMarkerId;

          return (
            <button
              aria-label={`Show finding ${markerLabel(marker)} on page ${pageNumber}`}
              aria-pressed={isActive}
              className={cn(
                "flex size-5 items-center justify-center border border-paper/25 bg-ink text-[0.625rem] font-medium leading-none text-paper/70 transition-colors hover:border-paper hover:bg-paper hover:text-ink",
                isActive && "border-paper bg-paper text-ink",
                marker.priority === "high" &&
                  !isActive &&
                  "border-destructive/70 text-destructive",
                marker.priority === "critical" &&
                  !isActive &&
                  "border-destructive text-destructive",
              )}
              data-pdf-marker={marker.id}
              key={marker.id}
              onClick={() => onMarkerSelect?.(marker.id)}
              title={markerLabel(marker)}
              type="button"
            >
              {marker.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PdfViewer({
  activeMarkerId = null,
  file,
  label,
  markers = [],
  onMarkerSelect,
  sourceUrl = null,
}: PdfViewerProps) {
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [pdfDocument, setPdfDocument] = React.useState<PdfDocumentProxy | null>(
    null
  );
  const [pageNumbers, setPageNumbers] = React.useState<number[]>([]);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const markersByPage = React.useMemo(() => {
    const nextMarkers = new Map<number, PdfPageMarker[]>();

    for (const marker of markers) {
      const pageNumber = marker.pageIndex + 1;
      const pageMarkers = nextMarkers.get(pageNumber) ?? [];

      pageMarkers.push(marker);
      nextMarkers.set(pageNumber, pageMarkers);
    }

    return nextMarkers;
  }, [markers]);

  React.useEffect(() => {
    let isCancelled = false;

    if (sourceUrl) {
      queueMicrotask(() => {
        if (!isCancelled) {
          setPdfUrl(sourceUrl);
        }
      });

      return () => {
        isCancelled = true;
      };
    }

    if (!file || file.type !== "application/pdf") {
      queueMicrotask(() => {
        if (!isCancelled) {
          setPdfUrl(null);
        }
      });

      return () => {
        isCancelled = true;
      };
    }

    const nextPdfUrl = URL.createObjectURL(file);
    queueMicrotask(() => {
      if (!isCancelled) {
        setPdfUrl(nextPdfUrl);
      }
    });

    return () => {
      isCancelled = true;
      URL.revokeObjectURL(nextPdfUrl);
    };
  }, [file, sourceUrl]);

  React.useEffect(() => {
    let isCancelled = false;

    async function renderPdf() {
      if (!pdfUrl) {
        setErrorMessage(null);
        setIsLoading(false);
        setPdfDocument(null);
        setPageNumbers([]);
        return;
      }

      setErrorMessage(null);
      setIsLoading(true);
      setPdfDocument(null);
      setPageNumbers([]);

      try {
        const pdfjs = await import("pdfjs-dist/webpack.mjs");

        const pdf = await pdfjs.getDocument(pdfUrl).promise;
        const renderedPageNumbers = Array.from(
          { length: pdf.numPages },
          (_, index) => index + 1
        );

        if (isCancelled) {
          pdf.destroy();
          return;
        }

        setPdfDocument(pdf);
        setPageNumbers(renderedPageNumbers);
        setIsLoading(false);
      } catch {
        if (!isCancelled) {
          setErrorMessage("Unable to render this PDF.");
          setIsLoading(false);
        }
      }
    }

    renderPdf();

    return () => {
      isCancelled = true;
    };
  }, [pdfUrl]);

  React.useEffect(() => {
    return () => {
      pdfDocument?.destroy();
    };
  }, [pdfDocument]);

  if (!pdfUrl) {
    return null;
  }

  return (
    <section
      aria-label={label ?? file?.name ?? "Selected PDF"}
      className="h-full min-h-0 w-full max-w-full overflow-hidden border border-paper/15"
      data-pdf-viewer
    >
      <div
        className="flex h-full flex-col gap-3 overflow-y-auto bg-paper/5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {isLoading ? (
          <div className="flex min-h-24 items-center gap-2 text-sm text-paper/55">
            <Loader2 className="size-4 animate-spin" />
            Rendering PDF
          </div>
        ) : null}

        {errorMessage ? (
          <p className="text-sm text-paper/60">{errorMessage}</p>
        ) : null}

        {pdfDocument
          ? pageNumbers.map((pageNumber) => (
              <PdfPage
                activeMarkerId={activeMarkerId}
                key={pageNumber}
                markers={markersByPage.get(pageNumber) ?? []}
                onMarkerSelect={onMarkerSelect}
                pageNumber={pageNumber}
                pdfDocument={pdfDocument}
              />
            ))
          : null}
      </div>
    </section>
  );
}
