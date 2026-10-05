import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculateContractPriceSchedule } from "@/lib/hic/contract-price";
import { HicDetailClient } from "./hic-detail-client";
import type { Hic, HicSigner } from "@/app/appointments/send-hic/types";

export type HicEvent = {
  id: string;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  occurred_at: string;
  user_id: string | null;
  signer_id: string | null;
};

// Gated by app/admin/layout.tsx's requireAdmin() — hics_select RLS also
// lets any admin see this regardless of created_by, so no extra check
// needed here.
export default async function AdminHicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: hic, error } = await supabase.from("hics").select("*").eq("id", id).single();
  if (error || !hic) notFound();

  const [{ data: signers }, { data: events }] = await Promise.all([
    supabase.from("hic_signers").select("*").eq("hic_id", id).order("created_at"),
    supabase
      .from("hic_events")
      .select("id, event_type, old_value, new_value, occurred_at, user_id, signer_id")
      .eq("hic_id", id)
      .order("occurred_at", { ascending: false }),
  ]);

  const schedule = calculateContractPriceSchedule(hic.est_production_kwh, hic.kwh_rate, hic.escalator, {
    degradation: 0.005,
    termYears: 25,
  });

  return (
    <HicDetailClient
      hic={hic as Hic}
      signers={(signers ?? []) as HicSigner[]}
      events={(events ?? []) as HicEvent[]}
      schedule={schedule}
    />
  );
}
