export type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  geocode_precision: string | null;
  disposition_id: string | null;
  prior_sale_date: string | null;
  is_manual: boolean;
  entered_by: string | null;
  entered_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Disposition = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
};

// Every active profile — used to populate the rep filter dropdown so a
// rep with zero direct zip_assignments (but who sees leads via a team)
// still shows up as a selectable option.
export type Profile = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
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
