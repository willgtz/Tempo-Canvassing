"use client";

import { PdfPageCanvas } from "./pdf-page-canvas";
import { slideshowFileUrl, type SlideshowSlide } from "@/lib/slideshow/types";

// One shared place deciding how a slide renders by file type — used by
// both the admin thumbnail grid and the fullscreen viewer, so there's
// exactly one spot to get PDF-vs-image handling right, not two to keep
// in sync. GIFs/animated WEBPs need nothing special: a plain <img> loops
// them automatically, no play button or JS required.
export function SlideImage({
  slide,
  className,
  onLoaded,
}: {
  slide: SlideshowSlide;
  className?: string;
  onLoaded?: () => void;
}) {
  const url = slideshowFileUrl(slide.storage_path);

  if (slide.file_type === "application/pdf") {
    return <PdfPageCanvas fileUrl={url} page={slide.pdf_page ?? 1} className={className} onLoaded={onLoaded} />;
  }

  // External Supabase Storage URL, not a local/optimizable asset —
  // next/image's optimizer also doesn't preserve animated GIF/WEBP frames.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={className} onLoad={onLoaded} />;
}
