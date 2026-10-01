import { createClient } from "@/lib/supabase/server";
import { SlideshowAdminClient } from "./slideshow-admin-client";

export default async function SlideshowAdminPage() {
  const supabase = await createClient();

  const [
    { data: slides, error: slidesError },
    { data: navButtons, error: navButtonsError },
  ] = await Promise.all([
    supabase
      .from("slideshow_slides")
      .select("id, language, storage_path, file_type, pdf_page, sort_order")
      .order("sort_order"),
    supabase
      .from("slideshow_nav_buttons")
      .select("id, language, label, target_slide_id, sort_order")
      .order("sort_order"),
  ]);

  if (slidesError || navButtonsError) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load slideshow: {slidesError?.message ?? navButtonsError?.message}
      </div>
    );
  }

  return (
    <SlideshowAdminClient
      initialSlides={slides ?? []}
      initialNavButtons={navButtons ?? []}
    />
  );
}
