// Special lead lists (Tempo CSC and any list a super admin creates).
// Schema: scripts/migrations/2026-11-12-special-lists-tempo-csc.sql.

export type SpecialList = {
  id: string;
  name: string;
  color: string;
  is_csc: boolean;
  map_hidden_disposition_ids: string[];
  map_hidden_appointment_status_ids: string[];
};

export const SPECIAL_LIST_COLUMNS =
  "id, name, color, is_csc, map_hidden_disposition_ids, map_hidden_appointment_status_ids";

export const DEFAULT_SPECIAL_LIST_COLOR = "#F59E0B";

// Same normalization as special_address_key() in the database, so "123
// Main St." and "123 main st" count as the same address.
export function specialAddressKey(addressLine: string, zipcode: string): string {
  return `${addressLine.toLowerCase().replace(/[^a-z0-9]/g, "")}|${zipcode}`;
}

export type SpecialLeadSource = {
  appointment_id: string;
  original_lead_id: string;
  added_at: string;
  scheduled_at: string;
  created_at: string;
  status_name: string;
  status_color: string;
  created_by_name: string | null;
  openers: string[];
  closers: string[];
  responses: { label: string; value: string }[];
  notes: { note: string; created_at: string; author_name: string }[];
  history: { field_changed: string; old_value: string | null; new_value: string | null; changed_at: string; author_name: string }[];
  hics: {
    status: string;
    financing: string | null;
    contract_price: number | null;
    system_size_kw: number | null;
    sent_at: string | null;
    completed_at: string | null;
  }[];
};

export type SpecialLeadAppointment = {
  appointment_id: string;
  scheduled_at: string;
  status_name: string;
  status_color: string;
  created_by_name: string | null;
  closers: string[];
};

export type SpecialLeadDetails = {
  sources: SpecialLeadSource[];
  appointments: SpecialLeadAppointment[];
};
