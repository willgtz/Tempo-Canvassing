import Link from "next/link";
import { redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { StarIcon } from "@/app/leads/star-icon";
import { NewSpecialListForm } from "./new-special-list-form";

export default async function SpecialListsPage() {
  const session = await getSuperAdminSession();
  if (!session) redirect("/admin/leads/upload");

  const supabase = await createClient();
  const { data: lists, error } = await supabase
    .from("special_lists")
    .select("id, name, color, is_csc, csc_last_run_at")
    .order("is_csc", { ascending: false })
    .order("name");

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load special lists: {error.message}
      </div>
    );
  }

  const counts = await Promise.all(
    (lists ?? []).map(async (list) => {
      const [{ count: leadCount }, { count: accessCount }] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("special_list_id", list.id),
        supabase.from("special_list_access").select("user_id", { count: "exact", head: true }).eq("list_id", list.id),
      ]);
      return { leadCount: leadCount ?? 0, accessCount: accessCount ?? 0 };
    })
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Special Lists</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Leads in a special list are hidden from everyone&apos;s zip codes. Only the people you give access to
          (and admins) see them, as stars on their Leads map. Upload to a list from the Upload tab.
        </p>
      </div>

      <NewSpecialListForm />

      <ul className="space-y-2">
        {(lists ?? []).map((list, i) => (
          <li key={list.id}>
            <Link
              href={`/admin/leads/special-lists/${list.id}`}
              className="flex items-center gap-3 rounded-xl border border-black/10 p-4 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              <StarIcon color={list.color} className="h-7 w-7 shrink-0" stroke="transparent" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {list.name}
                  {list.is_csc && (
                    <span className="ml-2 text-xs font-normal text-black/50 dark:text-white/50">
                      Tempo Customer Support Check · fills automatically
                    </span>
                  )}
                </p>
                <p className="text-sm text-black/60 dark:text-white/60">
                  {counts[i].leadCount} lead{counts[i].leadCount === 1 ? "" : "s"} · {counts[i].accessCount}{" "}
                  {counts[i].accessCount === 1 ? "person has" : "people have"} access
                </p>
              </div>
              <span className="text-sm text-black/40 dark:text-white/40">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
