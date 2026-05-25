"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

type PdfViewerProps = {
  file: File | null;
  label?: string;
  sourceUrl?: string | null;
};

type PdfDocumentProxy = Awaited<
  ReturnType<typeof import("pdfjs-dist").getDocument>["promise"]
>;

type PdfPageProps = {
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

function PdfPage({ pageNumber, pdfDocument }: PdfPageProps) {
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
    <div className="block" data-pdf-page-frame={pageNumber}>
      <canvas
        className="block w-full bg-white"
        data-pdf-page={pageNumber}
        ref={canvasRef}
      />
    </div>
  );
}

export function PdfViewer({
  file,
  label,
  sourceUrl = null,
}: PdfViewerProps) {
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [pdfDocument, setPdfDocument] = React.useState<PdfDocumentProxy | null>(
    null
  );
  const [pageNumbers, setPageNumbers] = React.useState<number[]>([]);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);

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
      className="h-auto min-h-0 w-full max-w-full overflow-visible"
      data-pdf-viewer
    >
      <div
        className="flex h-auto max-h-full flex-col gap-0 overflow-visible"
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
                key={pageNumber}
                pageNumber={pageNumber}
                pdfDocument={pdfDocument}
              />
            ))
          : null}
      </div>
    </section>
  );
}
