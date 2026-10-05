"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

// Shared by both the admin slide grid (small thumbnails) and the
// fullscreen viewer (as large as the screen) — same component, the
// container just dictates the render resolution either way.
//
// Resolution is matched to the ACTUAL on-screen size (container width *
// devicePixelRatio) rather than a fixed raster size stretched up via
// CSS — that mismatch is the classic cause of blurry PDF rendering.
// Re-renders via ResizeObserver whenever the container's real size
// changes (window resize, fullscreen toggle, thumbnail rail
// collapsing), so a page already on screen sharpens up instead of
// staying rasterized at whatever size it first rendered at.
export function PdfPageCanvas({
  fileUrl,
  page,
  className,
  onLoaded,
}: {
  fileUrl: string;
  page: number;
  className?: string;
  // Reports the rendered page's actual CSS size (not the raster buffer
  // size, which is DPR-scaled) — added for the HIC signing page's
  // click-to-sign overlay, which needs to position itself in the same
  // CSS pixel space the canvas actually occupies on screen. Optional and
  // additive: existing callers (the slideshow admin tool) that only care
  // about "has it loaded" can keep ignoring the argument.
  onLoaded?: (size: { width: number; height: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Bumped once a document finishes loading — the render effect below
  // keys off this (not the document object itself, which lives in a
  // ref) so it knows to run once pdfRef.current is actually populated.
  const [docVersion, setDocVersion] = useState(0);

  // Loads the PDF document itself — only re-runs when fileUrl changes,
  // NOT on every page switch. Previously this whole block (a full
  // re-fetch + re-parse of the document, via pdfjsLib.getDocument) ran
  // on every single page click, since page was in this effect's own
  // dependency array — wasteful, and worse: switching pages nulled out
  // the shared pdfRef in this same effect's cleanup every time. In a
  // tool like the template editor, where an admin clicks through many
  // pages quickly while positioning fields, overlapping load cycles
  // from rapid clicks could leave a stale/wrong page's content (or
  // fields) rendered. Decoupling "load the document" (here, once per
  // fileUrl) from "render a page" (below, on every page/resize change)
  // removes that race entirely, not just works around a symptom.
  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    async function load() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        loadingTask = pdfjsLib.getDocument({ url: fileUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          loadingTask.destroy();
          return;
        }
        pdfRef.current = pdf;
        setDocVersion((v) => v + 1);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load PDF.");
      }
    }

    load();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
      pdfRef.current = null;
    };
  }, [fileUrl]);

  // Renders the requested page, and re-renders on container resize.
  // Runs whenever a (new) document finishes loading, the requested
  // page changes, or the container's on-screen size changes.
  useEffect(() => {
    if (!pdfRef.current) return;

    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let renderScheduled = false;

    async function renderAtCurrentSize() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const pdf = pdfRef.current;
      if (!canvas || !container || !pdf || cancelled) return;

      try {
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;

        const containerWidth = container.clientWidth || 800;
        const unscaledViewport = pdfPage.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const scale = (containerWidth / unscaledViewport.width) * dpr;
        const viewport = pdfPage.getViewport({ scale });

        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${viewport.height / dpr}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        renderTask?.cancel();
        renderTask = pdfPage.render({ canvasContext: ctx, viewport, canvas });
        await renderTask.promise;
        if (!cancelled) onLoaded?.({ width: containerWidth, height: viewport.height / dpr });
      } catch (err) {
        // Cancelled renders reject too — not a real error, don't surface it.
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) {
          setError(err instanceof Error ? err.message : "Failed to render PDF page.");
        }
      }
    }

    function scheduleRender() {
      if (renderScheduled) return;
      renderScheduled = true;
      requestAnimationFrame(() => {
        renderScheduled = false;
        renderAtCurrentSize();
      });
    }

    renderAtCurrentSize();
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => scheduleRender());
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      renderTask?.cancel();
    };
  }, [docVersion, page, onLoaded]);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="h-auto w-full" />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
