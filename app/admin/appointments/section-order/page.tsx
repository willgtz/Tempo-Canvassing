import { createClient } from "@/lib/supabase/server";
import { SectionOrderRow } from "./section-order-row";

export default async function SectionOrderPage() {
  const supabase = await createClient();
  const { data: sections, error } = await supabase
    .from("appointment_detail_sections")
    .select("id, key, label, sort_order")
    .order("sort_order");

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load section order: {error.message}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Appointment Detail Panel Order</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Controls the order these sections appear in on both the web admin panel and the iOS app
          &mdash; lower sort order shows first. This page is web-only; there&apos;s no equivalent
          setting on iOS, but iOS reads the same order.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 font-medium">Section</th>
              <th className="px-3 py-2 font-medium">Sort Order</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(sections ?? []).map((s) => (
              <SectionOrderRow key={s.id} section={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
