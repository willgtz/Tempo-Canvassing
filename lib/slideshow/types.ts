export type SlideshowLanguage = "en" | "es";

export type SlideshowSlide = {
  id: string;
  language: SlideshowLanguage;
  storage_path: string;
  file_type: string;
  pdf_page: number | null;
  sort_order: number;
};

export type SlideshowNavButton = {
  id: string;
  language: SlideshowLanguage;
  label: string;
  target_slide_id: string | null;
  sort_order: number;
};

const BUCKET = "slideshow-media";

// Public bucket — a direct URL, no signing/auth needed, works the same
// whether called from a server component or the browser. Same format
// Supabase's own storage.from(bucket).getPublicUrl() produces, just
// without needing a client instance to call it.
export function slideshowFileUrl(storagePath: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

export const SLIDESHOW_BUCKET = BUCKET;

export const SLIDESHOW_ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
];
