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
  onLoaded?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        if (!cancelled) onLoaded?.();
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

    async function load() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
        loadingTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        if (cancelled) {
          loadingTask.destroy();
          return;
        }
        pdfRef.current = pdf;
        await renderAtCurrentSize();

        if (containerRef.current) {
          resizeObserver = new ResizeObserver(() => scheduleRender());
          resizeObserver.observe(containerRef.current);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load PDF.");
      }
    }

    load();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      renderTask?.cancel();
      loadingTaskRef.current?.destroy();
      pdfRef.current = null;
      loadingTaskRef.current = null;
    };
  }, [fileUrl, page, onLoaded]);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="h-auto w-full" />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
