import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SlideshowViewer } from "./slideshow-viewer";
import type { SlideshowLanguage } from "@/lib/slideshow/types";

// Top-level route, deliberately outside /admin, /leads, /appointments —
// none of their layouts (nav bars, tab bars) apply here, so this is the
// whole viewport with nothing else competing for it, matching the
// "no distractions" ask even before the fullscreen button is used.
export default async function SlideshowPage({
  params,
}: {
  params: Promise<{ language: string }>;
}) {
  const { language } = await params;
  if (language !== "en" && language !== "es") notFound();

  // Any signed-in user (opener, closer, admin) — not admin-gated. RLS
  // (slideshow_slides_select/slideshow_nav_buttons_select) already
  // permits any authenticated read; this just makes sure there's a real
  // session before rendering anything.
  await requireSession();
  const supabase = await createClient();

  const [{ data: slides, error: slidesError }, { data: navButtons, error: navButtonsError }] =
    await Promise.all([
      supabase
        .from("slideshow_slides")
        .select("id, language, storage_path, file_type, pdf_page, sort_order")
        .eq("language", language)
        .order("sort_order"),
      supabase
        .from("slideshow_nav_buttons")
        .select("id, language, label, target_slide_id, sort_order")
        .eq("language", language)
        .order("sort_order"),
    ]);

  if (slidesError || navButtonsError) {
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load slideshow: {slidesError?.message ?? navButtonsError?.message}
      </div>
    );
  }

  return (
    <SlideshowViewer
      language={language as SlideshowLanguage}
      slides={slides ?? []}
      navButtons={navButtons ?? []}
    />
  );
}
