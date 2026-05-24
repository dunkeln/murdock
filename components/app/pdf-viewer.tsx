"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

type PdfViewerProps = {
  file: File | null;
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
    <canvas
      className="w-full bg-white"
      data-pdf-page={pageNumber}
      ref={canvasRef}
    />
  );
}

export function PdfViewer({ file }: PdfViewerProps) {
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [pdfDocument, setPdfDocument] = React.useState<PdfDocumentProxy | null>(
    null
  );
  const [pageNumbers, setPageNumbers] = React.useState<number[]>([]);
  const pdfUrl = React.useMemo(() => {
    if (!file || file.type !== "application/pdf") {
      return null;
    }

    return URL.createObjectURL(file);
  }, [file]);

  React.useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

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
        const pdfjs = await import("pdfjs-dist");

        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

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
      aria-label={file?.name ?? "Selected PDF"}
      className="min-h-0 w-full overflow-hidden border border-paper/15 md:w-[50vw] md:max-w-3xl"
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
