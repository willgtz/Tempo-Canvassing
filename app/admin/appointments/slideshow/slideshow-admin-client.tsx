"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { countPdfPages } from "@/lib/slideshow/count-pdf-pages";
import { SlideImage } from "@/components/slideshow/slide-image";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  SLIDESHOW_BUCKET,
  SLIDESHOW_ACCEPTED_MIME_TYPES,
  type SlideshowLanguage,
  type SlideshowSlide,
  type SlideshowNavButton,
} from "@/lib/slideshow/types";
import {
  addSlides,
  deleteSlide,
  moveSlide,
  addNavButton,
  updateNavButton,
  deleteNavButton,
  moveNavButton,
} from "./actions";

const LANGUAGES: { id: SlideshowLanguage; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
];

function slideLabel(slide: SlideshowSlide, index: number): string {
  const type = slide.file_type === "application/pdf" ? `PDF p.${slide.pdf_page}` : slide.file_type.split("/")[1];
  return `Slide ${index + 1} (${type})`;
}

export function SlideshowAdminClient({
  initialSlides,
  initialNavButtons,
}: {
  initialSlides: SlideshowSlide[];
  initialNavButtons: SlideshowNavButton[];
}) {
  const [language, setLanguage] = useState<SlideshowLanguage>("en");
  const [slides, setSlides] = useState(initialSlides);
  const [navButtons, setNavButtons] = useState(initialNavButtons);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newButtonLabel, setNewButtonLabel] = useState("");
  const [newButtonTarget, setNewButtonTarget] = useState("");
  const [addButtonError, setAddButtonError] = useState<string | null>(null);
  const [isAddingButton, setIsAddingButton] = useState(false);

  const slidesForLang = slides.filter((s) => s.language === language).sort((a, b) => a.sort_order - b.sort_order);
  const navButtonsForLang = navButtons
    .filter((b) => b.language === language)
    .sort((a, b) => a.sort_order - b.sort_order);

  async function handleFilesSelected(fileList: FileList) {
    setUploadError(null);
    setIsUploading(true);
    const supabase = createClient();

    try {
      for (const file of Array.from(fileList)) {
        if (!SLIDESHOW_ACCEPTED_MIME_TYPES.includes(file.type)) {
          throw new Error(`${file.name}: unsupported file type (${file.type || "unknown"}).`);
        }

        const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
        const path = `${language}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from(SLIDESHOW_BUCKET)
          .upload(path, file, { contentType: file.type });
        if (uploadErr) throw new Error(`${file.name}: ${uploadErr.message}`);

        const entries =
          file.type === "application/pdf"
            ? Array.from({ length: await countPdfPages(file) }, (_, i) => ({
                storagePath: path,
                fileType: file.type,
                pdfPage: i + 1,
              }))
            : [{ storagePath: path, fileType: file.type, pdfPage: null }];

        const result = await addSlides(language, entries);
        if (!result.ok) throw new Error(`${file.name}: ${result.error}`);
        setSlides((prev) => [...prev, ...result.slides]);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleDeleteSlide(slide: SlideshowSlide) {
    if (!confirm("Delete this slide? This can't be undone.")) return;
    setSlides((prev) => prev.filter((s) => s.id !== slide.id));
    deleteSlide(slide.id).then((result) => {
      if (!result.ok) {
        setUploadError(result.error);
        setSlides((prev) => [...prev, slide]);
      }
    });
  }

  function handleMoveSlide(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= slidesForLang.length) return;
    const a = slidesForLang[index];
    const b = slidesForLang[swapIndex];
    setSlides((prev) =>
      prev.map((s) => {
        if (s.id === a.id) return { ...s, sort_order: b.sort_order };
        if (s.id === b.id) return { ...s, sort_order: a.sort_order };
        return s;
      })
    );
    moveSlide(a.id, direction).then((result) => {
      if (!result.ok) setUploadError(result.error);
    });
  }

  function handleAddNavButton(e: React.FormEvent) {
    e.preventDefault();
    setAddButtonError(null);
    if (!newButtonTarget) {
      setAddButtonError("Pick a slide to jump to.");
      return;
    }
    setIsAddingButton(true);
    addNavButton(language, newButtonLabel, newButtonTarget).then((result) => {
      setIsAddingButton(false);
      if (!result.ok) {
        setAddButtonError(result.error);
        return;
      }
      // revalidatePath already ran server-side — just re-derive from a
      // fresh id since the action doesn't echo the row back; simplest
      // correct option here is a light refetch via router would also
      // work, but a plain full-page values refresh isn't needed for one
      // row — construct it locally from what we already know.
      setNavButtons((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          language,
          label: newButtonLabel.trim(),
          target_slide_id: newButtonTarget,
          sort_order: (navButtonsForLang.at(-1)?.sort_order ?? -1) + 1,
        },
      ]);
      setNewButtonLabel("");
      setNewButtonTarget("");
    });
  }

  function handleUpdateNavButton(button: SlideshowNavButton, label: string, targetSlideId: string) {
    setNavButtons((prev) =>
      prev.map((b) => (b.id === button.id ? { ...b, label, target_slide_id: targetSlideId } : b))
    );
    updateNavButton(button.id, label, targetSlideId).then((result) => {
      if (!result.ok) setUploadError(result.error);
    });
  }

  function handleDeleteNavButton(button: SlideshowNavButton) {
    if (!confirm(`Remove the "${button.label}" button?`)) return;
    setNavButtons((prev) => prev.filter((b) => b.id !== button.id));
    deleteNavButton(button.id).then((result) => {
      if (!result.ok) {
        setUploadError(result.error);
        setNavButtons((prev) => [...prev, button]);
      }
    });
  }

  function handleMoveNavButton(index: number, direction: "up" | "down") {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= navButtonsForLang.length) return;
    const a = navButtonsForLang[index];
    const b = navButtonsForLang[swapIndex];
    setNavButtons((prev) =>
      prev.map((btn) => {
        if (btn.id === a.id) return { ...btn, sort_order: b.sort_order };
        if (btn.id === b.id) return { ...btn, sort_order: a.sort_order };
        return btn;
      })
    );
    moveNavButton(a.id, direction).then((result) => {
      if (!result.ok) setUploadError(result.error);
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Appointment Slideshow</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Managed here, used by every rep from the appointment detail panel. English and Spanish
          are completely separate slide sets. Original files are stored as uploaded — no
          compression — and PDFs with multiple pages become one slide per page automatically.
        </p>
      </div>

      <div className="flex gap-2 border-b border-black/10 dark:border-white/10">
        {LANGUAGES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLanguage(l.id)}
            className={
              language === l.id
                ? "border-b-2 border-black px-3 py-2 text-sm font-medium dark:border-white"
                : "px-3 py-2 text-sm text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
            }
          >
            {l.label}
          </button>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-medium">Slides</h2>
        <div className="mt-3 flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={SLIDESHOW_ACCEPTED_MIME_TYPES.join(",")}
            onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
            disabled={isUploading}
            className="text-sm"
          />
          {isUploading && <span className="text-sm text-black/50 dark:text-white/50">Uploading…</span>}
        </div>
        {uploadError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadError}</p>}

        {slidesForLang.length === 0 ? (
          <p className="mt-4 text-sm italic text-black/40 dark:text-white/40">
            No slides yet for {language === "en" ? "English" : "Spanish"}.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {slidesForLang.map((slide, i) => (
              <div key={slide.id} className="space-y-1.5 rounded-lg border border-black/10 p-2 dark:border-white/10">
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-black/5 dark:bg-white/5">
                  <SlideImage slide={slide} className="max-h-full max-w-full object-contain" />
                </div>
                <p className="text-xs text-black/60 dark:text-white/60">{slideLabel(slide, i)}</p>
                <div className="flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleMoveSlide(i, "up")}
                      disabled={i === 0}
                      className="rounded border border-black/15 px-1.5 py-0.5 text-xs disabled:opacity-30 dark:border-white/20"
                      title="Move earlier"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleMoveSlide(i, "down")}
                      disabled={i === slidesForLang.length - 1}
                      className="rounded border border-black/15 px-1.5 py-0.5 text-xs disabled:opacity-30 dark:border-white/20"
                      title="Move later"
                    >
                      ↓
                    </button>
                  </div>
                  <button
                    onClick={() => handleDeleteSlide(slide)}
                    className="rounded border border-red-600/40 px-1.5 py-0.5 text-xs text-red-600 dark:border-red-400/40 dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-medium">Quick-jump buttons</h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Shown in the slideshow&apos;s navigation bar for one-tap jumps — e.g. &quot;Tempo&quot;,
          &quot;Options&quot;, &quot;Gallery&quot;. Add as many or as few as you want.
        </p>

        {navButtonsForLang.length > 0 && (
          <div className="mt-3 space-y-2">
            {navButtonsForLang.map((button, i) => (
              <div key={button.id} className="flex flex-wrap items-center gap-2">
                <Input
                  value={button.label}
                  onChange={(e) => handleUpdateNavButton(button, e.target.value, button.target_slide_id ?? "")}
                  className="w-40"
                />
                <Select
                  value={button.target_slide_id ?? ""}
                  onChange={(e) => handleUpdateNavButton(button, button.label, e.target.value)}
                  className="w-48"
                >
                  <option value="">— pick a slide —</option>
                  {slidesForLang.map((s, si) => (
                    <option key={s.id} value={s.id}>
                      {slideLabel(s, si)}
                    </option>
                  ))}
                </Select>
                <button
                  onClick={() => handleMoveNavButton(i, "up")}
                  disabled={i === 0}
                  className="rounded border border-black/15 px-1.5 py-0.5 text-xs disabled:opacity-30 dark:border-white/20"
                >
                  ↑
                </button>
                <button
                  onClick={() => handleMoveNavButton(i, "down")}
                  disabled={i === navButtonsForLang.length - 1}
                  className="rounded border border-black/15 px-1.5 py-0.5 text-xs disabled:opacity-30 dark:border-white/20"
                >
                  ↓
                </button>
                <button
                  onClick={() => handleDeleteNavButton(button)}
                  className="rounded border border-red-600/40 px-1.5 py-0.5 text-xs text-red-600 dark:border-red-400/40 dark:text-red-400"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddNavButton} className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={newButtonLabel}
            onChange={(e) => setNewButtonLabel(e.target.value)}
            placeholder="Button label"
            required
            className="w-40"
          />
          <Select value={newButtonTarget} onChange={(e) => setNewButtonTarget(e.target.value)} className="w-48">
            <option value="">— pick a slide —</option>
            {slidesForLang.map((s, si) => (
              <option key={s.id} value={s.id}>
                {slideLabel(s, si)}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" disabled={isAddingButton || !newButtonLabel.trim()}>
            {isAddingButton ? "Adding…" : "Add button"}
          </Button>
        </form>
        {addButtonError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{addButtonError}</p>}
      </Card>
    </div>
  );
}
