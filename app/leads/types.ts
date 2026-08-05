export type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  lat: number | null;
  lng: number | null;
  geocode_precision: string | null;
  disposition_id: string | null;
  prior_sale_date: string | null;
  is_manual: boolean;
  entered_by: string | null;
  entered_by_name: string | null;
  created_at: string;
};

export type Disposition = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
};

// One row per (user, active zip). Comes from the subordinate_zip_assignments
// RPC — for a plain rep this is just their own zips; for a team_lead/admin
// it includes their subordinates' too (or everyone, for admins).
export type TeamZip = {
  user_id: string;
  full_name: string;
  zipcode: string;
};

// Admin-configurable submission-form question list — mirrors the iOS app's
// AppointmentFormField (TempoCanvassing/Sources/Models/Models.swift) so the
// "Set Appointment" form here renders the exact same dynamic questions.
export type AppointmentFormField = {
  id: string;
  label: string;
  field_type: "text" | "textarea" | "number" | "date" | "select" | "checkbox";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
};

export type RouteStop = {
  // null for the synthetic "current location" origin stop — everything
  // else is a real lead.
  leadId: string | null;
  name: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  lat: number;
  lng: number;
  legFromPrevious: { distanceText: string; durationText: string } | null;
};
