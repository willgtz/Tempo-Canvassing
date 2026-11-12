import { notFound, redirect } from "next/navigation";
import { getSuperAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { SpecialListDetailClient, type ListLeadRow, type ListTab } from "./special-list-detail-client";

const TABS: ListTab[] = ["leads", "access", "settings"];

export default async function SpecialListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSuperAdminSession();
  if (!session) redirect("/admin/leads/upload");

  const { id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();

  const { data: list, error: listError } = await supabase
    .from("special_lists")
    .select(
      "id, name, color, is_csc, csc_excluded_status_ids, csc_excluded_rep_ids, map_hidden_disposition_ids, map_hidden_appointment_status_ids, csc_last_run_at, csc_last_run_summary"
    )
    .eq("id", id)
    .maybeSingle();
  if (listError || !list) notFound();

  const [
    { data: leads },
    { data: sources },
    { data: soldIds },
    { data: dispositions },
    { data: statuses },
    { data: profiles },
    { data: access },
  ] = await Promise.all([
    fetchAllRows<ListLeadRow>((from, to) =>
      supabase
        .from("leads")
        .select("id, first_name, last_name, address_line, city, zipcode, disposition_id, batch_id, created_at, updated_at")
        .eq("special_list_id", id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    list.is_csc
      ? fetchAllRows<{ lead_id: string }>((from, to) =>
          supabase.from("special_lead_sources").select("lead_id").order("id").range(from, to)
        )
      : Promise.resolve({ data: [] as { lead_id: string }[], error: null }),
    supabase.rpc("special_leads_hidden_by_appointment"),
    supabase.from("dispositions").select("id, name, color, special_only").order("sort_order"),
    supabase.from("appointment_statuses").select("id, name, color").order("sort_order"),
    supabase.from("profiles").select("id, full_name, role, active").eq("active", true).order("full_name"),
    supabase
      .from("special_list_access")
      .select("user_id, granted_at, granter:profiles!granted_by(full_name)")
      .eq("list_id", id),
  ]);

  const autoLeadIds = new Set((sources ?? []).map((s) => s.lead_id));

  return (
    <SpecialListDetailClient
      key={list.id}
      list={list}
      initialTab={TABS.includes(tab as ListTab) ? (tab as ListTab) : "leads"}
      leads={(leads ?? []).map((l) => ({ ...l, isAuto: autoLeadIds.has(l.id) }))}
      soldLeadIds={(soldIds ?? []) as string[]}
      dispositions={dispositions ?? []}
      statuses={statuses ?? []}
      profiles={profiles ?? []}
      access={((access ?? []) as unknown as { user_id: string; granted_at: string; granter: { full_name: string } | null }[]).map(
        (a) => ({ userId: a.user_id, grantedAt: a.granted_at, grantedBy: a.granter?.full_name ?? null })
      )}
    />
  );
}
