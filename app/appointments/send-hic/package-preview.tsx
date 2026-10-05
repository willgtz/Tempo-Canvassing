"use client";

import { PdfPageCanvas } from "@/components/slideshow/pdf-page-canvas";

// Reuses the exact same page-by-page canvas renderer already proven for
// the slideshow admin tool — no new PDF-rendering code needed here, in
// the dev template-preview tool, or (later) for Phase 3's signing page /
// Phase 6's template editor, all of which render pages the same way.
export function PackagePreview({ url, pageCount }: { url: string; pageCount: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
        <div key={page} className="rounded border border-black/10 dark:border-white/10">
          <p className="border-b border-black/10 px-2 py-1 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
            Page {page} of {pageCount}
          </p>
          <PdfPageCanvas fileUrl={url} page={page} />
        </div>
      ))}
    </div>
  );
}
