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
// Loads a PDF once so several PdfPageCanvas instances can share it via
// their `pdf` prop. Multi-page views (the signing page, the rep's package
// preview) used to give every page its own getDocument() — each one a
// separate download, parse and pdf.js worker — so an 8-page HIC held 8
// copies of the document in memory. Low-memory Android phones ran out
// and Chrome killed the tab ("Can't open this page") right after the
// customer tapped Continue. Pass null to skip loading.
export function usePdfDocument(fileUrl: string | null): { pdf: PDFDocumentProxy | null; error: string | null } {
  const [state, setState] = useState<{ url: string | null; pdf: PDFDocumentProxy | null; error: string | null }>({
    url: null,
    pdf: null,
    error: null,
  });

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    async function load() {
      try {
        // Legacy build, not the default one: pdfjs v6's default build
        // calls Map.prototype.getOrInsertComputed, which iOS Safari
        // doesn't ship yet — customers on iPhones got a blank page and
        // "getOrInsertComputed is not a function" on the signing screen.
        // The legacy build (main + worker) polyfills it.
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        loadingTask = pdfjsLib.getDocument({ url: fileUrl as string });
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        setState({ url: fileUrl, pdf, error: null });
      } catch (err) {
        if (!cancelled) setState({ url: fileUrl, pdf: null, error: err instanceof Error ? err.message : "Failed to load PDF." });
      }
    }

    load();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [fileUrl]);

  // Never hand back a document (or error) belonging to a previous URL.
  if (!fileUrl || state.url !== fileUrl) return { pdf: null, error: null };
  return { pdf: state.pdf, error: state.error };
}

export function PdfPageCanvas({
  fileUrl,
  pdf: sharedPdf,
  page,
  className,
  maxPixelRatio,
  onLoaded,
}: {
  // Either a URL this canvas loads on its own (single-page callers like
  // the slideshow), or an already-loaded document from usePdfDocument
  // shared across every page on screen.
  fileUrl?: string;
  pdf?: PDFDocumentProxy | null;
  page: number;
  className?: string;
  // Caps the raster resolution. Phones report a devicePixelRatio of 3+,
  // which makes every page canvas ~9x the pixels of a 1x render; past 2x
  // there's no visible gain at phone width, just memory.
  maxPixelRatio?: number;
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
  // Width the canvas was last actually rendered at — lets the resize
  // handler below skip re-rendering when a ResizeObserver firing hasn't
  // actually changed the width this render depends on (see the comment
  // there for why that happens a lot more than you'd expect).
  const lastRenderedWidthRef = useRef<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Only loads its own copy when no shared document was passed in.
  const ownDocument = usePdfDocument(sharedPdf === undefined ? (fileUrl ?? null) : null);
  const pdf = sharedPdf === undefined ? ownDocument.pdf : sharedPdf;
  const error = (sharedPdf === undefined ? ownDocument.error : null) ?? renderError;

  // Renders the requested page, and re-renders on container resize.
  // Runs whenever a (new) document finishes loading, the requested
  // page changes, or the container's on-screen size changes.
  useEffect(() => {
    if (!pdf) return;
    const doc = pdf;

    let cancelled = false;
    let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let renderScheduled = false;

    async function renderAtCurrentSize() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container || cancelled) return;

      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;

        const containerWidth = container.clientWidth || 800;
        lastRenderedWidthRef.current = containerWidth;
        const unscaledViewport = pdfPage.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, maxPixelRatio ?? Infinity);
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
          setRenderError(err instanceof Error ? err.message : "Failed to render PDF page.");
        }
      }
    }

    function scheduleRender() {
      // Setting canvas.width/height (inside renderAtCurrentSize) clears
      // the canvas immediately per the HTML spec, so re-rendering when
      // nothing actually needs to change is a visible blank-then-redraw
      // flash, not just wasted work. On mobile Safari specifically, the
      // address bar collapsing/expanding as the page scrolls fires
      // ResizeObserver repeatedly — and since every page on the signing
      // screen mounts its own PdfPageCanvas, that was flashing every
      // page on screen at once, repeatedly, throughout a single scroll
      // gesture. Those events change viewport HEIGHT, not the container
      // WIDTH this render basis actually depends on, so skipping when
      // the width hasn't moved removes the redraw entirely rather than
      // just doing it off-thread.
      const container = containerRef.current;
      if (container && lastRenderedWidthRef.current !== null) {
        const currentWidth = container.clientWidth || 800;
        if (Math.abs(currentWidth - lastRenderedWidthRef.current) < 1) return;
      }
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
  }, [pdf, page, maxPixelRatio, onLoaded]);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="h-auto w-full" />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
