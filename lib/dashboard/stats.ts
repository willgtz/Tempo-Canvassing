// Pure computation only — no data access. Safe to call from Server
// Components (rep dashboard, computed once) or Client Components (admin
// dashboard, recomputed on every filter change via useMemo).

export type StatLead = {
  id: string;
  disposition_id: string | null;
  zipcode: string;
  lat: number | null;
  is_manual: boolean;
  created_at: string;
  // Optional — only the admin dashboard's rep-visibility preview needs
  // this (the manual-lead teammate carve-out); the rep dashboard's own
  // query doesn't select it and doesn't need to.
  entered_by?: string | null;
};

// The door_knock_counts RPC (schema.sql) buckets events by calendar day
// in America/Los_Angeles specifically — a plain `toISOString().slice(0,10)`
// gives the UTC date instead, which is wrong for a single-day query: for
// roughly 7-8 hours of every LA day (LA midnight until UTC catches up),
// the UTC date is already tomorrow, so a rep's evening activity would
// query the wrong day and show 0 despite real knocks. en-CA formats as
// YYYY-MM-DD, matching what the RPC's `date` param expects.
export function laDateOnly(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);
}

function cutoffIso(days: number, now: Date): string {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString();
}

export function countInLastDays(leads: StatLead[], days: number, now = new Date()): number {
  const cutoff = cutoffIso(days, now);
  return leads.filter((l) => l.created_at >= cutoff).length;
}

export function countByDisposition(leads: StatLead[]): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const l of leads) {
    counts.set(l.disposition_id, (counts.get(l.disposition_id) ?? 0) + 1);
  }
  return counts;
}

export function countByZip(leads: StatLead[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of leads) {
    counts.set(l.zipcode, (counts.get(l.zipcode) ?? 0) + 1);
  }
  return counts;
}

export function countWithoutLocation(leads: StatLead[]): number {
  return leads.filter((l) => l.lat == null).length;
}

export function countManual(leads: StatLead[]): number {
  return leads.filter((l) => l.is_manual).length;
}

// One bucket per day, oldest first, always `days` buckets even if empty —
// callers don't have to backfill gaps for the trend chart.
export function dailyCounts(
  leads: StatLead[],
  days: number,
  now = new Date()
): { date: string; count: number }[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const l of leads) {
    const day = l.created_at.slice(0, 10);
    if (buckets.has(day)) {
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
  }

  return Array.from(buckets, ([date, count]) => ({ date, count }));
}

// Leads have no owner column (visibility is zip-based, not assignment-
// based — see BUILD_CONTEXT), so "leads by rep" is derived by attributing
// each lead to every rep currently assigned to its zip. A zip shared by
// two reps counts toward both, matching how visibility itself works.
export function countByRepViaZips(
  leads: StatLead[],
  zipToUserIds: Map<string, string[]>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const userIds = zipToUserIds.get(lead.zipcode);
    if (!userIds) continue;
    for (const userId of userIds) {
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
  }
  return counts;
}

export type DoorKnockGoalStatus = "in_progress" | "achieved" | "failed";

// Derived, not stored — a goal's status is always a pure function of its
// own target/window plus the current verified count, evaluated fresh on
// every read. "Achieved" fires immediately once the target's hit, even
// before end_date arrives; "failed" only once end_date has passed with
// the target still unmet.
export function deriveGoalStatus(
  goal: { start_date: string; end_date: string; target_count: number },
  verifiedCount: number,
  today: string // laDateOnly(new Date())
): DoorKnockGoalStatus {
  if (verifiedCount >= goal.target_count) return "achieved";
  if (today > goal.end_date) return "failed";
  return "in_progress";
}

// ============================================================
// Appointments + lead-activity stats (admin dashboard only)
// ============================================================

export type StatAppointment = {
  id: string;
  lead_id: string;
  scheduled_at: string;
  status_id: string;
  created_by: string;
  created_at: string;
};

export type AppointmentAssignmentRow = {
  appointment_id: string;
  user_id: string;
  role: "opener" | "closer";
};

export type AppointmentNoteRow = {
  appointment_id: string;
  user_id: string;
};

export type AppointmentStatusRow = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_default: boolean;
};

// Every lead touched at least once — a verified-or-not disposition change
// OR a note, matching door_knock_events' own "what counts as a knock"
// definition exactly (schema.sql). Leads NOT in this set have literally
// never been dispositioned or noted, i.e. never knocked at all.
export function countNeverKnocked(leadIds: string[], touchedLeadIds: Set<string>): number {
  let count = 0;
  for (const id of leadIds) {
    if (!touchedLeadIds.has(id)) count++;
  }
  return count;
}

// scheduled_at is a timestamptz; date-range filtering compares just the
// LA-calendar-date portion, same convention door_knock_counts/laDateOnly
// already use elsewhere on this dashboard — an appointment scheduled late
// evening LA time shouldn't fall on the "wrong" side of a day boundary
// just because its stored UTC timestamp already rolled to the next day.
export function filterAppointmentsByDate<T extends { scheduled_at: string }>(
  appointments: T[],
  from: string,
  to: string
): T[] {
  return appointments.filter((a) => {
    const d = laDateOnly(new Date(a.scheduled_at));
    return d >= from && d <= to;
  });
}

// "Sitting in Assigned with no updates" — a closer IS assigned (so this
// deliberately excludes Unassigned, a staffing gap rather than a closer
// follow-up gap), the status has never moved off Assigned, and none of
// this appointment's closers have written a single note.
export function countStuckAssignedNoCloserNotes(
  appointments: StatAppointment[],
  assignments: AppointmentAssignmentRow[],
  notes: AppointmentNoteRow[],
  assignedStatusId: string | undefined
): number {
  if (!assignedStatusId) return 0;
  const closerIdsByAppt = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (a.role !== "closer") continue;
    const set = closerIdsByAppt.get(a.appointment_id) ?? new Set<string>();
    set.add(a.user_id);
    closerIdsByAppt.set(a.appointment_id, set);
  }
  const noteAuthorsByAppt = new Map<string, Set<string>>();
  for (const n of notes) {
    const set = noteAuthorsByAppt.get(n.appointment_id) ?? new Set<string>();
    set.add(n.user_id);
    noteAuthorsByAppt.set(n.appointment_id, set);
  }

  let count = 0;
  for (const appt of appointments) {
    if (appt.status_id !== assignedStatusId) continue;
    const closerIds = closerIdsByAppt.get(appt.id);
    if (!closerIds || closerIds.size === 0) continue;
    const noteAuthors = noteAuthorsByAppt.get(appt.id);
    const closerWroteNote = noteAuthors && Array.from(closerIds).some((id) => noteAuthors.has(id));
    if (!closerWroteNote) count++;
  }
  return count;
}

// One row per rep holding an 'opener' assignment on any of the given
// appointments — an appointment with multiple openers counts toward each.
export function appointmentsByOpener(
  appointments: StatAppointment[],
  assignments: AppointmentAssignmentRow[]
): Map<string, number> {
  const apptIds = new Set(appointments.map((a) => a.id));
  const counts = new Map<string, number>();
  for (const a of assignments) {
    if (a.role !== "opener" || !apptIds.has(a.appointment_id)) continue;
    counts.set(a.user_id, (counts.get(a.user_id) ?? 0) + 1);
  }
  return counts;
}

// closerId -> statusId -> count. An appointment with multiple closers
// counts toward each closer's own row for that status.
export function appointmentsByCloserAndStatus(
  appointments: StatAppointment[],
  assignments: AppointmentAssignmentRow[]
): Map<string, Map<string, number>> {
  const apptById = new Map(appointments.map((a) => [a.id, a]));
  const result = new Map<string, Map<string, number>>();
  for (const a of assignments) {
    if (a.role !== "closer") continue;
    const appt = apptById.get(a.appointment_id);
    if (!appt) continue;
    const byStatus = result.get(a.user_id) ?? new Map<string, number>();
    byStatus.set(appt.status_id, (byStatus.get(appt.status_id) ?? 0) + 1);
    result.set(a.user_id, byStatus);
  }
  return result;
}

// Closed / (Closed + No Show) — of appointments with a definitive
// outcome, what fraction actually happened. Excludes Cancelled (never
// attempted) and Rescheduled (outcome still pending). Null when there's
// no definitive-outcome data yet, so callers can render "—" instead of
// a misleading 0%.
export function computeShowRate(closedCount: number, noShowCount: number): number | null {
  const denom = closedCount + noShowCount;
  if (denom === 0) return null;
  return closedCount / denom;
}

// Per opener: how many of the appointments they opened actually closed —
// the "are this opener's appointments worth setting" signal, independent
// of raw volume (appointmentsByOpener above).
export function openerToCloserConversion(
  appointments: StatAppointment[],
  assignments: AppointmentAssignmentRow[],
  closedStatusId: string | undefined
): Map<string, { total: number; closed: number }> {
  const apptById = new Map(appointments.map((a) => [a.id, a]));
  const result = new Map<string, { total: number; closed: number }>();
  for (const a of assignments) {
    if (a.role !== "opener") continue;
    const appt = apptById.get(a.appointment_id);
    if (!appt) continue;
    const entry = result.get(a.user_id) ?? { total: 0, closed: 0 };
    entry.total++;
    if (closedStatusId && appt.status_id === closedStatusId) entry.closed++;
    result.set(a.user_id, entry);
  }
  return result;
}

// Scheduled in the past, closer assigned, still sitting in Assigned —
// someone forgot to record what actually happened. Deliberately doesn't
// include Unassigned (that's a staffing gap, not a follow-up gap).
export function staleAppointments(
  appointments: StatAppointment[],
  assignedStatusId: string | undefined,
  now = new Date()
): StatAppointment[] {
  if (!assignedStatusId) return [];
  const nowIso = now.toISOString();
  return appointments.filter((a) => a.status_id === assignedStatusId && a.scheduled_at < nowIso);
}

// Average hours between a lead being created and its first door-knock
// event (disposition change or note, whichever came first) — "how fast
// are fresh leads getting worked." Only meaningful over leads that HAVE
// been knocked at least once (never-knocked leads are already counted
// separately by countNeverKnocked), so those are excluded here rather
// than dragging the average toward some arbitrary "still not knocked"
// placeholder value.
export function averageHoursToFirstKnock(
  leadCreatedAtById: Map<string, string>,
  firstKnockAtById: Map<string, string>
): number | null {
  let totalHours = 0;
  let n = 0;
  for (const [leadId, firstKnockAt] of firstKnockAtById) {
    const createdAt = leadCreatedAtById.get(leadId);
    if (!createdAt) continue;
    const hours = (new Date(firstKnockAt).getTime() - new Date(createdAt).getTime()) / 3_600_000;
    if (hours < 0) continue; // clock skew/bad data guard, not a real case
    totalHours += hours;
    n++;
  }
  if (n === 0) return null;
  return totalHours / n;
}

// Monday-anchored week-start date (en-CA, LA-time — same convention as
// every other date bucketing on this dashboard) for a given ISO timestamp.
function weekStart(iso: string): string {
  const d = new Date(laDateOnly(new Date(iso)) + "T00:00:00");
  const day = d.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  return laDateOnly(d);
}

// dispositionName -> weekStartDate -> count, from raw disposition-change
// history rows (lead_history.new_value is already the disposition's NAME
// at the time of the change — see addManualLead/updateLeadDisposition,
// app/leads/actions.ts — not its id, so no dispositions-table join is
// needed here). Tracks CHANGES over time, not lead creation, so a shift
// in a rep's outcome mix shows up even for leads created long ago.
export function weeklyDispositionCounts(
  historyRows: { new_value: string | null; changed_at: string }[],
  weeks: number,
  now = new Date()
): { weekStarts: string[]; countsByDisposition: Map<string, number[]> } {
  const weekStarts: string[] = [];
  const today = new Date(laDateOnly(now) + "T00:00:00");
  const day = today.getDay();
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMonday);
    d.setDate(d.getDate() - i * 7);
    weekStarts.push(laDateOnly(d));
  }
  const weekIndex = new Map(weekStarts.map((w, i) => [w, i]));

  const countsByDisposition = new Map<string, number[]>();
  for (const row of historyRows) {
    if (!row.new_value) continue;
    const w = weekStart(row.changed_at);
    const idx = weekIndex.get(w);
    if (idx === undefined) continue;
    const series = countsByDisposition.get(row.new_value) ?? new Array(weeks).fill(0);
    series[idx]++;
    countsByDisposition.set(row.new_value, series);
  }
  return { weekStarts, countsByDisposition };
}

// Re-attributes a per-user count to every team that user is on — same
// "counts toward each team they're a member of" convention team-based
// zip/manual-lead sharing already uses (schema.sql, 2026-09-24 multi-team
// migration), rather than picking just one team per user. A user on no
// team contributes nothing to the rollup (there's no "team" bucket for
// them to land in).
export function rollupByTeam(
  countsByUser: Map<string, number>,
  teamIdsByUser: Map<string, string[]>
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [userId, count] of countsByUser) {
    for (const teamId of teamIdsByUser.get(userId) ?? []) {
      result.set(teamId, (result.get(teamId) ?? 0) + count);
    }
  }
  return result;
}

// Same idea, for the nested closer x status breakdown.
export function rollupNestedByTeam(
  nestedByUser: Map<string, Map<string, number>>,
  teamIdsByUser: Map<string, string[]>
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const [userId, byStatus] of nestedByUser) {
    for (const teamId of teamIdsByUser.get(userId) ?? []) {
      const existing = result.get(teamId) ?? new Map<string, number>();
      for (const [statusId, count] of byStatus) {
        existing.set(statusId, (existing.get(statusId) ?? 0) + count);
      }
      result.set(teamId, existing);
    }
  }
  return result;
}

export function formatStatValue(n: number): string {
  if (n >= 10000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return n.toLocaleString("en-US");
}
