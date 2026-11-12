import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { UploadLeadsClient } from "./upload-client";

export default async function UploadLeadsPage({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const session = await getAdminSession();
  const isSuperAdmin = session?.role === "super_admin";
  const { list: initialListId } = await searchParams;
  const supabase = await createClient();
  const [{ data: dispositions, error }, { data: specialLists }] = await Promise.all([
    supabase.from("dispositions").select("id, name, color, is_default, special_only").order("sort_order"),
    // Uploading to a special list is super-admin only.
    isSuperAdmin
      ? supabase.from("special_lists").select("id, name, color").order("is_csc", { ascending: false }).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; color: string }[] }),
  ]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load dispositions: {error.message}
      </div>
    );
  }

  const lists = specialLists ?? [];
  return (
    <UploadLeadsClient
      dispositions={dispositions ?? []}
      specialLists={lists}
      initialListId={lists.some((l) => l.id === initialListId) ? initialListId! : ""}
    />
  );
}
