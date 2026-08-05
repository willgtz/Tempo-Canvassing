import { createClient } from "@/lib/supabase/server";
import { UploadLeadsClient } from "./upload-client";

export default async function UploadLeadsPage() {
  const supabase = await createClient();
  const { data: dispositions, error } = await supabase
    .from("dispositions")
    .select("id, name, color, is_default")
    .order("sort_order");

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load dispositions: {error.message}
      </div>
    );
  }

  return <UploadLeadsClient dispositions={dispositions ?? []} />;
}
