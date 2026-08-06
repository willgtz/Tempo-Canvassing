// Mirrors the iOS app's Appointment-family models
// (TempoCanvassing/Sources/Models/Models.swift) so this admin page behaves
// identically to the iOS AppointmentDetailScreen. AppointmentFormField
// itself already lives in app/leads/types.ts (shared with the rep-facing
// submission form) — imported from there rather than duplicated.

export type Appointment = {
  id: string;
  lead_id: string;
  scheduled_at: string;
  status_id: string;
  custom_field_responses: Record<string, string>;
  created_by: string;
  created_at: string;
  updated_at: string;
  deal_submitted_at: string | null;
};

export type AppointmentStatus = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_default: boolean;
};

export type AppointmentRole = "opener" | "closer";

export type AppointmentAssignment = {
  id: string;
  appointment_id: string;
  user_id: string;
  role: AppointmentRole;
  full_name: string;
};

export type AppointmentNote = {
  id: string;
  appointment_id: string;
  note: string;
  created_at: string;
  author_name: string;
};

// Slimmer than the full Lead type in app/leads/types.ts — this page only
// ever displays name + address, never edits disposition/etc.
export type AppointmentLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
};

export type ActiveProfile = {
  id: string;
  full_name: string;
};
