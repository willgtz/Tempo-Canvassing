"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode/google";

export type UpdateLeadInput = {
  firstName: string | null;
  lastName: string | null;
  addressLine: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  phone: string | null;
  email: string | null;
  dispositionId: string | null;
  priorSaleDate: string | null;
};

export type UpdateLeadResult = { ok: true } | { ok: false; error: string };

const ZIP_RE = /^\d{5}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function updateLead(
  leadId: string,
  input: UpdateLeadInput
): Promise<UpdateLeadResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const addressLine = input.addressLine.trim();
  const zipcode = input.zipcode.trim();
  const city = input.city?.trim() || null;
  const state = input.state?.trim() || null;

  if (!addressLine) return { ok: false, error: "Address is required." };
  if (!ZIP_RE.test(zipcode)) return { ok: false, error: "Zip must be exactly 5 digits." };
  if (input.priorSaleDate !== null && !DATE_RE.test(input.priorSaleDate)) {
    return { ok: false, error: "Invalid sold date." };
  }

  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("leads")
    .select("address_line, city, state, zipcode, disposition_id")
    .eq("id", leadId)
    .single();

  if (currentError || !current) {
    return { ok: false, error: currentError?.message ?? "Lead not found." };
  }

  const addressChanged =
    addressLine !== current.address_line ||
    city !== current.city ||
    state !== current.state ||
    zipcode !== current.zipcode;

  // Correcting an address without re-geocoding would leave the map pin
  // pointing at the old (wrong) location — one address, so it's cheap to
  // just re-geocode synchronously rather than route through the
  // background-job machinery the bulk CSV upload uses.
  let geocodeFields: {
    lat: number | null;
    lng: number | null;
    geocode_precision: string | null;
    geocoded_at: string;
  } | null = null;

  if (addressChanged) {
    try {
      const fullAddress = [addressLine, city, [state, zipcode].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ");
      const result = await geocodeAddress(fullAddress);
      geocodeFields = {
        lat: result.lat,
        lng: result.lng,
        geocode_precision: result.precision,
        geocoded_at: new Date().toISOString(),
      };
    } catch {
      geocodeFields = {
        lat: null,
        lng: null,
        geocode_precision: null,
        geocoded_at: new Date().toISOString(),
      };
    }
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      address_line: addressLine,
      city,
      state,
      zipcode,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      disposition_id: input.dispositionId,
      prior_sale_date: input.priorSaleDate,
      updated_at: new Date().toISOString(),
      ...(geocodeFields ?? {}),
    })
    .eq("id", leadId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // Same audit trail as the rep-facing disposition change (app/leads/actions.ts)
  // — keep it consistent regardless of which screen made the change.
  if (input.dispositionId !== current.disposition_id) {
    const idsToLookUp = [current.disposition_id, input.dispositionId].filter(
      (id): id is string => id !== null
    );
    const { data: dispositionRows } = idsToLookUp.length
      ? await supabase.from("dispositions").select("id, name").in("id", idsToLookUp)
      : { data: [] as { id: string; name: string }[] };
    const nameById = new Map((dispositionRows ?? []).map((d) => [d.id, d.name]));
    const oldValue = current.disposition_id
      ? (nameById.get(current.disposition_id) ?? "Unknown")
      : "None";
    const newValue = input.dispositionId ? (nameById.get(input.dispositionId) ?? "Unknown") : "None";

    await supabase.from("lead_history").insert({
      lead_id: leadId,
      user_id: session.userId,
      field_changed: "disposition",
      old_value: oldValue,
      new_value: newValue,
    });
  }

  revalidatePath("/admin/leads/all");
  revalidatePath("/leads");
  return { ok: true };
}

export type DeleteLeadResult = { ok: true } | { ok: false; error: string };

export async function deleteLead(leadId: string): Promise<DeleteLeadResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", leadId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/leads/all");
  revalidatePath("/admin/leads/batches");
  revalidatePath("/leads");
  return { ok: true };
}

export type DeleteLeadsResult =
  | { ok: true; deletedCount: number }
  | { ok: false; error: string };

export async function deleteLeads(leadIds: string[]): Promise<DeleteLeadsResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Unauthorized" };

  if (leadIds.length === 0) {
    return { ok: false, error: "No leads selected." };
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .in("id", leadIds);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/leads/all");
  revalidatePath("/admin/leads/batches");
  revalidatePath("/leads");
  return { ok: true, deletedCount: count ?? leadIds.length };
}
