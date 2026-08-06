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
};

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

export function formatStatValue(n: number): string {
  if (n >= 10000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return n.toLocaleString("en-US");
}
