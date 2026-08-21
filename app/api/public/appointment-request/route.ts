import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geocodeAddress } from "@/lib/geocode/google";

const ZIP_RE = /^\d{5}$/;

// Genuinely public, unauthenticated — no requireSession/requireAdmin
// anywhere in this route or the page that posts to it (app/appointment-
// request/page.tsx). For someone with no account (e.g. a designer who
// only needs to know a job is coming) to submit an appointment without
// it ever touching the Leads flow. Uses the service-role client (see the
// comment on createAdminClient) since there's no auth.uid() at all here
// for RLS to key off — this is the deliberate, narrow exception, not a
// shortcut around it.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body as {
    firstName?: string;
    lastName?: string;
    addressLine?: string;
    city?: string;
    state?: string;
    zipcode?: string;
    scheduledAt?: string;
    responses?: Record<string, string>;
  };

  const addressLine = (input.addressLine ?? "").trim();
  const zipcode = (input.zipcode ?? "").trim();
  const scheduledAt = input.scheduledAt ?? "";

  if (!addressLine) return NextResponse.json({ error: "Address is required." }, { status: 400 });
  if (!ZIP_RE.test(zipcode)) {
    return NextResponse.json({ error: "Zip must be exactly 5 digits." }, { status: 400 });
  }
  if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
    return NextResponse.json({ error: "A valid appointment date/time is required." }, { status: 400 });
  }

  const city = input.city?.trim() || null;
  const state = input.state?.trim() || null;
  const responses = input.responses && typeof input.responses === "object" ? input.responses : {};

  let lat: number | null = null;
  let lng: number | null = null;
  let precision: string | null = null;
  try {
    const fullAddress = [addressLine, city, [state, zipcode].filter(Boolean).join(" ")]
      .filter(Boolean)
      .join(", ");
    const result = await geocodeAddress(fullAddress);
    lat = result.lat;
    lng = result.lng;
    precision = result.precision;
  } catch {
    // Same fallback as every other manual-entry path — insert with no
    // coordinates rather than rejecting the whole submission.
  }

  const supabase = createAdminClient();

  // entered_by stays null (schema.sql: leads.entered_by is nullable) —
  // there's no real user to attribute this to. Who actually knocked/
  // called this in is captured as free text in the Additional Opener
  // form field below instead, same as the rest of custom_field_responses.
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      address_line: addressLine,
      city,
      state,
      zipcode,
      lat,
      lng,
      geocode_precision: precision,
      geocoded_at: new Date().toISOString(),
      is_manual: true,
      entered_by: null,
    })
    .select("id")
    .single();

  if (leadError || !lead) {
    return NextResponse.json(
      { error: leadError?.message ?? "Failed to create lead." },
      { status: 500 }
    );
  }

  // appointments.created_by IS NOT NULL (schema.sql) — unlike
  // leads.entered_by there's no nullable escape hatch here, so this
  // attributes to whichever admin account is oldest/first, purely for
  // the FK constraint. Not shown to anyone as "who created this."
  const { data: adminProfile, error: adminError } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["admin", "super_admin"])
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (adminError || !adminProfile) {
    return NextResponse.json(
      { error: "No active admin account found to attribute this appointment to." },
      { status: 500 }
    );
  }

  const { data: defaultStatus, error: statusError } = await supabase
    .from("appointment_statuses")
    .select("id")
    .eq("is_default", true)
    .single();

  if (statusError || !defaultStatus) {
    return NextResponse.json(
      { error: statusError?.message ?? "No default appointment status is configured." },
      { status: 500 }
    );
  }

  const { error: apptError } = await supabase.from("appointments").insert({
    lead_id: lead.id,
    scheduled_at: new Date(scheduledAt).toISOString(),
    status_id: defaultStatus.id,
    custom_field_responses: responses,
    created_by: adminProfile.id,
  });

  if (apptError) {
    return NextResponse.json({ error: apptError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
