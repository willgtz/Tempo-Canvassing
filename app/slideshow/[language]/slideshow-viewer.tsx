"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SlideImage } from "@/components/slideshow/slide-image";
import { cn } from "@/components/ui/cn";
import type { SlideshowLanguage, SlideshowNavButton, SlideshowSlide } from "@/lib/slideshow/types";

export function SlideshowViewer({
  language,
  slides,
  navButtons,
}: {
  language: SlideshowLanguage;
  slides: SlideshowSlide[];
  navButtons: SlideshowNavButton[];
}) {
  const sortedSlides = useMemo(() => [...slides].sort((a, b) => a.sort_order - b.sort_order), [slides]);
  const sortedNavButtons = useMemo(
    () => [...navButtons].sort((a, b) => a.sort_order - b.sort_order),
    [navButtons]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  // Closed by default on every load — a fixed-width rail that's always
  // open would eat real screen space on a phone, which is exactly what
  // reps are presenting from in the field. Still fully usable on any
  // screen size via the toggle, just not on by default.
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentSlide = sortedSlides[currentIndex] as SlideshowSlide | undefined;
  // Forced closed in fullscreen regardless of the toggle's own state —
  // "no distractions, just the slides" once fullscreen is active.
  const showThumbnailRail = thumbnailsOpen && !isFullscreen;

  function goNext() {
    setCurrentIndex((i) => Math.min(i + 1, sortedSlides.length - 1));
  }
  function goPrev() {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }
  function goToSlideId(slideId: string) {
    const idx = sortedSlides.findIndex((s) => s.id === slideId);
    if (idx >= 0) setCurrentIndex(idx);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSlides.length]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      // Fullscreen API support for non-video elements is inconsistent on
      // iOS Safari specifically — this can silently no-op there; nothing
      // else in the viewer depends on fullscreen actually succeeding.
      containerRef.current.requestFullscreen?.().catch(() => {});
    }
  }

  if (sortedSlides.length === 0) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black p-6 text-center text-white">
        <p className="text-sm text-white/60">
          No {language === "en" ? "English" : "Spanish"} slides have been uploaded yet. Ask an
          admin to add some under Admin → Appointments → Slideshow.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-dvh w-full select-none bg-black text-white">
      {showThumbnailRail && (
        <div className="flex w-28 flex-none flex-col gap-2 overflow-y-auto border-r border-white/10 bg-black/90 p-2 sm:w-36">
          {sortedSlides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                "flex aspect-[4/3] flex-none items-center justify-center overflow-hidden rounded border bg-white/5",
                i === currentIndex ? "border-white" : "border-white/15"
              )}
            >
              <SlideImage slide={s} className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 p-3">
          <button
            onClick={() => setThumbnailsOpen((v) => !v)}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
          >
            {thumbnailsOpen ? "Hide thumbnails" : "Show thumbnails"}
          </button>
          <span className="text-xs text-white/50">
            {currentIndex + 1} / {sortedSlides.length}
          </span>
          <button
            onClick={toggleFullscreen}
            className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
          >
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center p-2">
            {currentSlide && (
              <SlideImage key={currentSlide.id} slide={currentSlide} className="max-h-full max-w-full object-contain" />
            )}
          </div>

          {/* Tap zones — left/right half of the slide area, under the
              visible arrow buttons (later in DOM order = on top, so the
              arrows' own clicks aren't swallowed by the zone behind them). */}
          <button
            aria-label="Previous slide"
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="absolute inset-y-0 left-0 w-1/2 disabled:cursor-default"
          />
          <button
            aria-label="Next slide"
            onClick={goNext}
            disabled={currentIndex === sortedSlides.length - 1}
            className="absolute inset-y-0 right-0 w-1/2 disabled:cursor-default"
          />

          <button
            aria-label="Previous slide"
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl disabled:opacity-30"
          >
            ‹
          </button>
          <button
            aria-label="Next slide"
            onClick={goNext}
            disabled={currentIndex === sortedSlides.length - 1}
            className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl disabled:opacity-30"
          >
            ›
          </button>
        </div>

        {sortedNavButtons.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3">
            {sortedNavButtons.map((b) => (
              <button
                key={b.id}
                onClick={() => b.target_slide_id && goToSlideId(b.target_slide_id)}
                disabled={!b.target_slide_id}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/10 disabled:opacity-40"
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
