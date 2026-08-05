import { createClient } from "@/lib/supabase/server";
import { DispositionRow } from "./disposition-row";
import { NewDispositionForm } from "./new-disposition-form";

export default async function DispositionsPage() {
  const supabase = await createClient();
  const { data: dispositions, error } = await supabase
    .from("dispositions")
    .select("id, name, color, sort_order, is_default")
    .order("sort_order");

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load dispositions: {error.message}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Dispositions</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Colors are used for map pins. Only one disposition can be the
          default for new leads.
        </p>
      </div>

      <NewDispositionForm />

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">Sort Order</th>
              <th className="px-3 py-2 font-medium">Default</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(dispositions ?? []).map((d) => (
              <DispositionRow key={d.id} disposition={d} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
