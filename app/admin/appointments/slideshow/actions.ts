"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { SLIDESHOW_BUCKET, type SlideshowLanguage, type SlideshowSlide } from "@/lib/slideshow/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// The actual file bytes are already uploaded directly from the browser
// to Supabase Storage (client -> storage, not through this server
// action — avoids Server Actions' request body size limit, which a
// high-res PNG or PDF could easily exceed) by the time this runs. This
// just writes the metadata rows — one per entry, which for a multi-page
// PDF means multiple rows sharing the same storage_path (one per page,
// numPages already detected client-side via pdfjs-dist before upload).
export type AddSlidesEntry = {
  storagePath: string;
  fileType: string;
  pdfPage: number | null;
};

export type AddSlidesResult = { ok: true; slides: SlideshowSlide[] } | { ok: false; error: string };

export async function addSlides(
  language: SlideshowLanguage,
  entries: AddSlidesEntry[]
): Promise<AddSlidesResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };
  if (entries.length === 0) return { ok: true, slides: [] };

  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("slideshow_slides")
    .select("sort_order")
    .eq("language", language)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const rows = entries.map((e) => ({
    language,
    storage_path: e.storagePath,
    file_type: e.fileType,
    pdf_page: e.pdfPage,
    sort_order: nextSortOrder++,
    uploaded_by: session.userId,
  }));

  const { data, error } = await supabase
    .from("slideshow_slides")
    .insert(rows)
    .select("id, language, storage_path, file_type, pdf_page, sort_order");
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to save slides." };

  revalidatePath("/admin/appointments/slideshow");
  return { ok: true, slides: data as SlideshowSlide[] };
}

export async function deleteSlide(slideId: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: slide, error: fetchError } = await supabase
    .from("slideshow_slides")
    .select("storage_path")
    .eq("id", slideId)
    .single();
  if (fetchError || !slide) return { ok: false, error: fetchError?.message ?? "Slide not found." };

  const { error: deleteError } = await supabase.from("slideshow_slides").delete().eq("id", slideId);
  if (deleteError) return { ok: false, error: deleteError.message };

  // Only remove the underlying file once nothing else references it — a
  // multi-page PDF's pages all share one storage_path, and deleting page
  // 2 of 5 shouldn't take the file out from under the other 4 slide rows.
  const { count } = await supabase
    .from("slideshow_slides")
    .select("id", { count: "exact", head: true })
    .eq("storage_path", slide.storage_path);
  if (!count) {
    await supabase.storage.from(SLIDESHOW_BUCKET).remove([slide.storage_path]);
  }

  revalidatePath("/admin/appointments/slideshow");
  return { ok: true };
}

export async function moveSlide(slideId: string, direction: "up" | "down"): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: slide, error: fetchError } = await supabase
    .from("slideshow_slides")
    .select("id, language, sort_order")
    .eq("id", slideId)
    .single();
  if (fetchError || !slide) return { ok: false, error: fetchError?.message ?? "Slide not found." };

  // "up" wants the closest slide BELOW the current sort_order (largest
  // value that's still less than current) — that's descending order on
  // the filtered set, not ascending. "down" wants the closest ABOVE
  // (smallest value still greater) — ascending. The two were swapped
  // (bug found 2026-10-01: "up" on the last slide was jumping it to the
  // very first position instead of swapping with its immediate
  // predecessor, since ascending order on the <current set returns the
  // smallest match, i.e. the first slide, not the closest one).
  const { data: neighbor } = await supabase
    .from("slideshow_slides")
    .select("id, sort_order")
    .eq("language", slide.language)
    .order("sort_order", { ascending: direction === "down" })
    .gt("sort_order", direction === "down" ? slide.sort_order : -1)
    .lt("sort_order", direction === "up" ? slide.sort_order : 1_000_000_000)
    .limit(1)
    .maybeSingle();
  if (!neighbor) return { ok: true }; // already first/last — nothing to do

  const { error: error1 } = await supabase
    .from("slideshow_slides")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", slide.id);
  const { error: error2 } = await supabase
    .from("slideshow_slides")
    .update({ sort_order: slide.sort_order })
    .eq("id", neighbor.id);
  if (error1 || error2) return { ok: false, error: error1?.message ?? error2?.message ?? "Failed to reorder." };

  revalidatePath("/admin/appointments/slideshow");
  return { ok: true };
}

export async function addNavButton(
  language: SlideshowLanguage,
  label: string,
  targetSlideId: string
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Label is required." };

  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("slideshow_nav_buttons")
    .select("sort_order")
    .eq("language", language)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("slideshow_nav_buttons").insert({
    language,
    label: trimmed,
    target_slide_id: targetSlideId,
    sort_order: (maxRow?.sort_order ?? -1) + 1,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments/slideshow");
  return { ok: true };
}

export async function updateNavButton(
  id: string,
  label: string,
  targetSlideId: string
): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Label is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("slideshow_nav_buttons")
    .update({ label: trimmed, target_slide_id: targetSlideId })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments/slideshow");
  return { ok: true };
}

export async function deleteNavButton(id: string): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("slideshow_nav_buttons").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/appointments/slideshow");
  return { ok: true };
}

export async function moveNavButton(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();

  const { data: button, error: fetchError } = await supabase
    .from("slideshow_nav_buttons")
    .select("id, language, sort_order")
    .eq("id", id)
    .single();
  if (fetchError || !button) return { ok: false, error: fetchError?.message ?? "Button not found." };

  // Same fix as moveSlide's identical neighbor-selection query above.
  const { data: neighbor } = await supabase
    .from("slideshow_nav_buttons")
    .select("id, sort_order")
    .eq("language", button.language)
    .order("sort_order", { ascending: direction === "down" })
    .gt("sort_order", direction === "down" ? button.sort_order : -1)
    .lt("sort_order", direction === "up" ? button.sort_order : 1_000_000_000)
    .limit(1)
    .maybeSingle();
  if (!neighbor) return { ok: true };

  const { error: error1 } = await supabase
    .from("slideshow_nav_buttons")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", button.id);
  const { error: error2 } = await supabase
    .from("slideshow_nav_buttons")
    .update({ sort_order: button.sort_order })
    .eq("id", neighbor.id);
  if (error1 || error2) return { ok: false, error: error1?.message ?? error2?.message ?? "Failed to reorder." };

  revalidatePath("/admin/appointments/slideshow");
  return { ok: true };
}
