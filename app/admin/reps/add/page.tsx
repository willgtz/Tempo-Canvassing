import { createClient } from "@/lib/supabase/server";
import { AddRepForm } from "../add-rep-form";

export default async function AddRepPage() {
  const supabase = await createClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .order("full_name");

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load managers: {error.message}
      </div>
    );
  }

  const managerOptions = (profiles ?? []).filter((p) =>
    ["team_lead", "admin", "super_admin"].includes(p.role)
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 p-6">
      <div>
        <h1 className="text-xl font-semibold">Add Rep</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Set a password directly, or send an email invite so they set their
          own.
        </p>
      </div>

      <AddRepForm managerOptions={managerOptions} />
    </div>
  );
}
