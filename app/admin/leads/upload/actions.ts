"use server";

import { after } from "next/server";
import { getAdminSession } from "@/lib/auth/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { specialAddressKey } from "@/lib/special-lists";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode/google";
import { MAX_ROWS } from "./constants";

export type CommitRow = {
  firstName: string | null;
  lastName: string | null;
  addressLine: string;
  city: string | null;
  state: string | null;
  zipcode: string; // from the CSV column — authoritative, never the geocoded zip
  phone: string | null;
  email: string | null;
  priorSaleDate: string | null;
  // From the file's Status column, already matched to a disposition by
  // the client; null falls back to the disposition picked for the file.
  dispositionId: string | null;
  notes: string | null;
};

export type CommitResult =
  | { ok: true; batchId: string; insertedCount: number; duplicateCount: number }
  | { ok: false; error: string };

const GEOCODE_CONCURRENCY = 8;

function fullAddress(row: {
  addressLine: string;
  city: string | null;
  state: string | null;
  zipcode: string;
}): string {
  return [row.addressLine, row.city, [row.state, row.zipcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

type GeocodableLead = {
  id: string;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
};

async function geocodeAndUpdateOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lead: GeocodableLead
) {
  // Never re-pay to geocode an address already geocoded elsewhere in the
  // table — reuse its coordinates/precision instead of calling Google again.
  const { data: cached } = await supabase
    .from("leads")
    .select("lat, lng, geocode_precision")
    .eq("address_line", lead.address_line)
    .eq("zipcode", lead.zipcode)
    .not("lat", "is", null)
    .neq("id", lead.id)
    .limit(1)
    .maybeSingle();

  let lat: number | null = null;
  let lng: number | null = null;
  let precision: string | null = null;

  if (cached) {
    lat = cached.lat;
    lng = cached.lng;
    precision = cached.geocode_precision;
  } else {
    try {
      const result = await geocodeAddress(
        fullAddress({
          addressLine: lead.address_line,
          city: lead.city,
          state: lead.state,
          zipcode: lead.zipcode,
        })
      );
      lat = result.lat;
      lng = result.lng;
      precision = result.precision;
    } catch {
      // Geocoding failed outright (e.g. missing API key at runtime) — leave
      // lat/lng null rather than dropping the lead.
    }
  }

  await supabase
    .from("leads")
    .update({ lat, lng, geocode_precision: precision, geocoded_at: new Date().toISOString() })
    .eq("id", lead.id);
}

async function geocodeBatchInBackground(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leads: GeocodableLead[]
) {
  let index = 0;
  async function worker() {
    while (index < leads.length) {
      const lead = leads[index++];
      await geocodeAndUpdateOne(supabase, lead);
    }
  }
  const workerCount = Math.min(GEOCODE_CONCURRENCY, leads.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
}

export async function commitLeadBatch(
  filename: string,
  rows: CommitRow[],
  dispositionId: string | null,
  // Upload into a special list instead of the regular new-homeowner pool.
  specialListId: string | null = null
): Promise<CommitResult> {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false, error: "Unauthorized" };
  }
  if (specialListId && session.role !== "super_admin") {
    return { ok: false, error: "Only super admins can upload to a special list." };
  }

  if (rows.length === 0) {
    return { ok: false, error: "No rows to insert." };
  }

  if (rows.length > MAX_ROWS) {
    return {
      ok: false,
      error: `This file has ${rows.length} rows, which exceeds the ${MAX_ROWS}-row limit per upload. Split it into smaller files and upload each separately.`,
    };
  }

  const supabase = await createClient();

  let listName: string | null = null;
  if (specialListId) {
    const { data: list } = await supabase.from("special_lists").select("name").eq("id", specialListId).maybeSingle();
    if (!list) return { ok: false, error: "That special list no longer exists." };
    listName = list.name;
  }

  // Special-only sub-dispos (Dead Lead) can't go on regular leads; the
  // database rejects them too, this just falls back instead of failing.
  const { data: dispositionRows } = await supabase.from("dispositions").select("id, special_only");
  const allowedDispositionIds = new Set(
    (dispositionRows ?? []).filter((d) => specialListId || !d.special_only).map((d) => d.id)
  );
  const fileDispositionId = dispositionId && allowedDispositionIds.has(dispositionId) ? dispositionId : null;

  // A special list never holds the same address twice — skip rows already
  // in the list or repeated earlier in this file.
  let rowsToInsert = rows;
  if (specialListId) {
    const { data: existing, error: existingError } = await fetchAllRows<{ address_line: string; zipcode: string }>(
      (from, to) =>
        supabase
          .from("leads")
          .select("address_line, zipcode")
          .eq("special_list_id", specialListId)
          .order("id")
          .range(from, to)
    );
    if (existingError) return { ok: false, error: existingError.message };
    const seen = new Set(existing.map((l) => specialAddressKey(l.address_line, l.zipcode)));
    rowsToInsert = rows.filter((row) => {
      const key = specialAddressKey(row.addressLine, row.zipcode);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (rowsToInsert.length === 0) {
      return { ok: false, error: `Every address in this file is already in ${listName}.` };
    }
  }

  // Row-Level Security (leads_insert_admin / batches_admin in schema.sql)
  // is what actually enforces admin-only writes here — this call runs
  // under the signed-in user's own session, not a service-role key.
  const { data: batch, error: batchError } = await supabase
    .from("lead_batches")
    .insert({
      filename,
      uploaded_by: session.userId,
      row_count: rowsToInsert.length,
      notes: listName ? `Special list: ${listName}` : null,
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    return {
      ok: false,
      error: batchError?.message ?? "Failed to create lead batch.",
    };
  }

  const leadsToInsert = rowsToInsert.map((row) => ({
    batch_id: batch.id,
    first_name: row.firstName,
    last_name: row.lastName,
    address_line: row.addressLine,
    city: row.city,
    state: row.state,
    zipcode: row.zipcode,
    phone: row.phone,
    email: row.email,
    prior_sale_date: row.priorSaleDate,
    disposition_id:
      row.dispositionId && allowedDispositionIds.has(row.dispositionId) ? row.dispositionId : fileDispositionId,
    special_list_id: specialListId,
  }));

  const { data: insertedLeads, error: insertError } = await supabase
    .from("leads")
    .insert(leadsToInsert)
    .select("id, address_line, city, state, zipcode");

  if (insertError || !insertedLeads) {
    return { ok: false, error: insertError?.message ?? "Failed to insert leads." };
  }

  // Response goes back to the client now — geocoding happens after, so the
  // upload itself doesn't wait on Google.
  after(() => geocodeBatchInBackground(supabase, insertedLeads));

  // The Notes column becomes each lead's first note. PostgREST returns
  // inserted rows in input order, so index i is rowsToInsert[i].
  const notesToInsert = insertedLeads.flatMap((lead, i) => {
    const note = rowsToInsert[i]?.notes?.trim();
    return note ? [{ lead_id: lead.id, user_id: session.userId, note }] : [];
  });
  if (notesToInsert.length > 0) {
    const { error: notesError } = await supabase.from("lead_notes").insert(notesToInsert);
    if (notesError) {
      return {
        ok: false,
        error: `${insertedLeads.length} leads were added, but their notes couldn't be saved: ${notesError.message}`,
      };
    }
  }

  return {
    ok: true,
    batchId: batch.id as string,
    insertedCount: insertedLeads.length,
    duplicateCount: rows.length - rowsToInsert.length,
  };
}
