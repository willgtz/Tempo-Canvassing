"use client";

import { AppointmentsClient } from "@/app/appointments/appointments-client";
import type { Appointment, AppointmentLead, AppointmentStatus } from "@/app/admin/appointments/types";

// Temporary, unauthenticated diagnostic route — mimics the real
// /appointments layout chain (nav + flex-1/min-h-0 wrappers) with mock
// data so the no-page-scroll fix can be checked in a headless browser
// against the real deployed bundle, without a login session. Delete once
// confirmed.
const STATUSES: AppointmentStatus[] = [
  { id: "s1", name: "Scheduled", color: "#2563eb", sort_order: 0, is_default: true },
];

const LEADS: AppointmentLead[] = Array.from({ length: 15 }, (_, i) => ({
  id: `lead${i}`,
  first_name: `Test${i}`,
  last_name: "Lead",
  address_line: `${100 + i} Main St`,
  city: "Testville",
  state: "CA",
  zipcode: "90001",
}));

const APPOINTMENTS: Appointment[] = Array.from({ length: 15 }, (_, i) => ({
  id: `appt${i}`,
  lead_id: `lead${i}`,
  scheduled_at: new Date(new Date().setHours(8 + i, 0, 0, 0)).toISOString(),
  status_id: "s1",
  custom_field_responses: {},
  created_by: "u1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deal_submitted_at: null,
}));

export default function DebugApptPage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <nav className="flex items-center justify-between border-b border-black/10 px-6 py-3 dark:border-white/10">
        <span className="text-sm font-medium">Fake Nav</span>
      </nav>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AppointmentsClient
          currentUserId="u1"
          appointments={APPOINTMENTS}
          statuses={STATUSES}
          leads={LEADS}
          initialAssignments={[]}
          initialNotes={[]}
        />
      </div>
    </div>
  );
}
