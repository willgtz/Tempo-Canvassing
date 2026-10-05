import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { generateDraftPreview } from "@/lib/hic/pdf/generate-draft-preview";
import { SAMPLE_SCENARIOS } from "./sample-data";
import { PackagePreview } from "@/app/appointments/send-hic/package-preview";

// Dev-only, admin-gated field-position verification tool — doubles as
// the spec's required "sample filled package" generator. Blocked only on
// the real fenixsun.com production deployment, not local dev or Vercel
// preview deployments — VERCEL_ENV (Vercel's own distinction) is used
// rather than NODE_ENV, since Vercel builds/runs *both* preview and
// production deployments with NODE_ENV=production; checking NODE_ENV
// here would have also 404'd this on every preview URL the team actually
// reviews changes on, not just the real production site. Phase 6's
// drag-and-drop editor replaces this as the real way to check/adjust
// template field placement going forward.
export default async function HicTemplatePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  await requireAdmin();

  const { scenario: scenarioKey } = await searchParams;
  const scenario = SAMPLE_SCENARIOS.find((s) => s.key === scenarioKey) ?? SAMPLE_SCENARIOS[0];

  let preview: { url: string; pageCount: number } | null = null;
  let error: string | null = null;
  try {
    preview = await generateDraftPreview(scenario.hic);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to generate preview.";
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">HIC Template Preview (dev only)</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Renders a sample filled package for visual field-position verification.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SAMPLE_SCENARIOS.map((s) => (
          <a
            key={s.key}
            href={`/dev/hic-template-preview?scenario=${s.key}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              s.key === scenario.key
                ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                : "border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            }`}
          >
            {s.label}
          </a>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {preview && <PackagePreview url={preview.url} pageCount={preview.pageCount} />}
    </div>
  );
}
