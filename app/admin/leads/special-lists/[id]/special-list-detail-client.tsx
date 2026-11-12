"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/components/ui/cn";
import { StarIcon } from "@/app/leads/star-icon";
import { archiveLead } from "@/app/leads/actions";
import {
  deleteSpecialList,
  grantSpecialListAccess,
  revokeSpecialListAccess,
  runCscSyncNow,
  updateSpecialList,
  type CscSyncSummary,
} from "../actions";

export type ListTab = "leads" | "access" | "settings";

export type ListLeadRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  zipcode: string;
  disposition_id: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
};

type ListDetail = {
  id: string;
  name: string;
  color: string;
  is_csc: boolean;
  csc_excluded_status_ids: string[];
  csc_excluded_closer_ids: string[];
  map_hidden_disposition_ids: string[];
  map_hidden_appointment_status_ids: string[];
  csc_last_run_at: string | null;
  csc_last_run_summary: CscSyncSummary | null;
};

type Option = { id: string; name: string; color: string };
type DispositionOption = Option & { special_only: boolean };
type ProfileOption = { id: string; full_name: string; role: string };
type AccessRow = { userId: string; grantedAt: string; grantedBy: string | null };

const ROLE_LABELS: Record<string, string> = {
  rep: "Rep",
  team_lead: "Team lead",
  admin: "Admin",
  super_admin: "Super admin",
};

function summaryText(s: CscSyncSummary) {
  const parts = [
    `${s.added} new lead${s.added === 1 ? "" : "s"}`,
    `${s.attached} appointment${s.attached === 1 ? "" : "s"} attached to existing leads`,
  ];
  if (s.restored) parts.push(`${s.restored} restored`);
  if (s.removed) parts.push(`${s.removed} removed for excluded closers`);
  return parts.join(" · ");
}

export function SpecialListDetailClient({
  list,
  initialTab,
  leads,
  soldLeadIds,
  dispositions,
  statuses,
  profiles,
  access,
}: {
  list: ListDetail;
  initialTab: ListTab;
  leads: (ListLeadRow & { isAuto: boolean })[];
  soldLeadIds: string[];
  dispositions: DispositionOption[];
  statuses: Option[];
  profiles: ProfileOption[];
  access: AccessRow[];
}) {
  const [tab, setTab] = useState<ListTab>(initialTab);

  function selectTab(next: ListTab) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-6">
      <div className="space-y-1">
        <Link href="/admin/leads/special-lists" className="text-xs text-black/50 hover:underline dark:text-white/50">
          ‹ Special Lists
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <StarIcon color={list.color} className="h-6 w-6" stroke="transparent" />
          {list.name}
        </h1>
        {list.is_csc && (
          <p className="text-sm text-black/60 dark:text-white/60">
            Tempo Customer Support Check. Appointments go 14 days past their scheduled time with no notes, status
            change or reschedule land here automatically, checked daily.
          </p>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-black/10 text-sm dark:border-white/10">
        {(
          [
            ["leads", `Leads (${leads.length})`],
            ["access", `Access (${access.length})`],
            ["settings", "Settings"],
          ] as [ListTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => selectTab(key)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2",
              tab === key ? "border-blue-600 font-medium" : "border-transparent text-black/60 dark:text-white/60"
            )}
          >
            {label}
          </button>
        ))}
        <Link
          href={`/admin/leads/upload?list=${list.id}`}
          className="-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-black/60 hover:underline dark:text-white/60"
        >
          Upload ›
        </Link>
      </div>

      {tab === "leads" && (
        <LeadsTab list={list} leads={leads} soldLeadIds={soldLeadIds} dispositions={dispositions} />
      )}
      {tab === "access" && <AccessTab list={list} profiles={profiles} access={access} />}
      {tab === "settings" && (
        <SettingsTab list={list} dispositions={dispositions} statuses={statuses} profiles={profiles} />
      )}
    </div>
  );
}

function LeadsTab({
  list,
  leads,
  soldLeadIds,
  dispositions,
}: {
  list: ListDetail;
  leads: (ListLeadRow & { isAuto: boolean })[];
  soldLeadIds: string[];
  dispositions: DispositionOption[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mapFilter, setMapFilter] = useState<"all" | "on" | "off">("all");
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startRemoving] = useTransition();

  const dispositionById = useMemo(() => new Map(dispositions.map((d) => [d.id, d])), [dispositions]);
  const soldSet = useMemo(() => new Set(soldLeadIds), [soldLeadIds]);

  function offMapReason(lead: ListLeadRow) {
    if (soldSet.has(lead.id)) return "Sold";
    if (lead.disposition_id && list.map_hidden_disposition_ids.includes(lead.disposition_id)) {
      return dispositionById.get(lead.disposition_id)?.name ?? "Closed out";
    }
    return null;
  }

  const q = query.trim().toLowerCase();
  const visible = leads.filter((lead) => {
    if (removedIds.has(lead.id)) return false;
    const off = offMapReason(lead) != null;
    if (mapFilter === "on" && off) return false;
    if (mapFilter === "off" && !off) return false;
    if (!q) return true;
    return `${lead.first_name ?? ""} ${lead.last_name ?? ""} ${lead.address_line} ${lead.city ?? ""} ${lead.zipcode}`
      .toLowerCase()
      .includes(q);
  });

  function handleRemove(lead: ListLeadRow) {
    if (!confirm(`Remove ${lead.address_line} from ${list.name}? You can restore it from the Archived tab.`)) return;
    setError(null);
    startRemoving(async () => {
      const result = await archiveLead(lead.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRemovedIds((prev) => new Set(prev).add(lead.id));
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or address" className="min-w-0 flex-1" />
        <div className="flex overflow-hidden rounded-full border border-black/15 text-xs dark:border-white/20">
          {(
            [
              ["all", "All"],
              ["on", "On map"],
              ["off", "Off map"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMapFilter(key)}
              className={cn("px-3 py-1.5", mapFilter === key && "bg-blue-600 text-white dark:bg-blue-500")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-black/50 dark:text-white/50">No leads match.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Address</th>
                <th className="px-3 py-2 font-medium">Sub-dispo</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Added</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visible.map((lead) => {
                const disposition = lead.disposition_id ? dispositionById.get(lead.disposition_id) : undefined;
                const off = offMapReason(lead);
                return (
                  <tr key={lead.id} className="border-t border-black/5 dark:border-white/10">
                    <td className="px-3 py-2">
                      <Link href={`/leads?lead=${lead.id}`} className="hover:underline">
                        {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {lead.address_line}
                      {lead.city ? `, ${lead.city}` : ""} {lead.zipcode}
                    </td>
                    <td className="px-3 py-2">
                      <Badge color={disposition?.color}>{disposition?.name ?? "No sub-dispo"}</Badge>
                      {off && <span className="ml-2 text-xs text-black/50 dark:text-white/50">Off map ({off})</span>}
                    </td>
                    <td className="px-3 py-2 text-black/60 dark:text-white/60">
                      {lead.isAuto ? "Auto (CSC)" : lead.batch_id ? "Upload" : "—"}
                    </td>
                    <td className="px-3 py-2 text-black/60 dark:text-white/60">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleRemove(lead)}
                        className="text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AccessTab({ list, profiles, access }: { list: ListDetail; profiles: ProfileOption[]; access: AccessRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const grantedIds = new Set(access.map((a) => a.userId));
  const q = query.trim().toLowerCase();
  // Admins always see every list, so only reps and team leads are offered.
  const candidates = q
    ? profiles
        .filter((p) => !grantedIds.has(p.id) && (p.role === "rep" || p.role === "team_lead"))
        .filter((p) => p.full_name.toLowerCase().includes(q))
        .slice(0, 8)
    : [];

  function run(userId: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setPendingUserId(userId);
    startTransition(async () => {
      const result = await action();
      setPendingUserId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setQuery("");
      router.refresh();
    });
  }

  const sortedAccess = [...access].sort((a, b) =>
    (profileById.get(a.userId)?.full_name ?? "").localeCompare(profileById.get(b.userId)?.full_name ?? "")
  );

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a rep or team lead to grant access…"
          className="w-full"
        />
        {candidates.length > 0 && (
          <ul className="divide-y divide-black/5 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
            {candidates.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {p.full_name} <span className="text-xs text-black/50 dark:text-white/50">{ROLE_LABELS[p.role] ?? p.role}</span>
                </span>
                <Button
                  size="sm"
                  disabled={pendingUserId === p.id}
                  onClick={() => run(p.id, () => grantSpecialListAccess(list.id, p.id))}
                >
                  {pendingUserId === p.id ? "Granting…" : "Grant"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {q && candidates.length === 0 && (
          <p className="text-xs text-black/50 dark:text-white/50">No reps or team leads match that name without access already.</p>
        )}
        <p className="text-xs text-black/50 dark:text-white/50">
          Admins and super admins always see this list. Removing someone takes effect the next time their map loads.
        </p>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {sortedAccess.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-black/50 dark:border-white/20 dark:text-white/50">
          Nobody has access yet.
        </p>
      ) : (
        <ul className="divide-y divide-black/5 rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
          {sortedAccess.map((a) => {
            const profile = profileById.get(a.userId);
            return (
              <li key={a.userId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{profile?.full_name ?? "Inactive user"}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">
                    Granted {new Date(a.grantedAt).toLocaleDateString()}
                    {a.grantedBy ? ` by ${a.grantedBy}` : ""}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pendingUserId === a.userId}
                  onClick={() => run(a.userId, () => revokeSpecialListAccess(list.id, a.userId))}
                >
                  {pendingUserId === a.userId ? "Removing…" : "Remove"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CheckboxList({
  options,
  selected,
  onChange,
}: {
  options: { id: string; label: string; color?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const checked = selected.includes(o.id);
        return (
          <label
            key={o.id}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              checked
                ? "border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500"
                : "border-black/15 dark:border-white/20"
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={() => onChange(checked ? selected.filter((id) => id !== o.id) : [...selected, o.id])}
            />
            {o.color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: o.color }} />}
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

function SettingsTab({
  list,
  dispositions,
  statuses,
  profiles,
}: {
  list: ListDetail;
  dispositions: DispositionOption[];
  statuses: Option[];
  profiles: ProfileOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(list.name);
  const [color, setColor] = useState(list.color);
  const [hiddenDispositions, setHiddenDispositions] = useState(list.map_hidden_disposition_ids);
  const [hiddenStatuses, setHiddenStatuses] = useState(list.map_hidden_appointment_status_ids);
  const [excludedStatuses, setExcludedStatuses] = useState(list.csc_excluded_status_ids);
  const [excludedClosers, setExcludedClosers] = useState(list.csc_excluded_closer_ids);
  const [closerQuery, setCloserQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isRunning, startRunning] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  const closerOptions = profiles
    .filter((p) => excludedClosers.includes(p.id) || p.full_name.toLowerCase().includes(closerQuery.trim().toLowerCase()))
    .map((p) => ({ id: p.id, label: p.full_name }));

  function handleSave() {
    const closersChanged =
      excludedClosers.length !== list.csc_excluded_closer_ids.length ||
      excludedClosers.some((id) => !list.csc_excluded_closer_ids.includes(id));
    if (
      list.is_csc &&
      closersChanged &&
      !confirm(
        "Changing excluded closers applies right away: CSC leads from newly excluded closers are removed, and leads from closers you un-excluded come back. Continue?"
      )
    ) {
      return;
    }
    setError(null);
    setMessage(null);
    startSaving(async () => {
      const result = await updateSpecialList(list.id, {
        name,
        color,
        mapHiddenDispositionIds: hiddenDispositions,
        mapHiddenAppointmentStatusIds: hiddenStatuses,
        cscExcludedStatusIds: excludedStatuses,
        cscExcludedCloserIds: excludedClosers,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(result.syncSummary ? `Saved. CSC check: ${summaryText(result.syncSummary)}.` : "Saved.");
      router.refresh();
    });
  }

  function handleRunNow() {
    setError(null);
    setMessage(null);
    startRunning(async () => {
      const result = await runCscSyncNow();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`CSC check done: ${summaryText(result.summary)}.`);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`Delete ${list.name}? This only works once the list has no leads.`)) return;
    setError(null);
    startDeleting(async () => {
      const result = await deleteSpecialList(list.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/admin/leads/special-lists");
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <label className="text-xs font-medium">Name (shown as the leads&apos; main status)</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="w-full" maxLength={60} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Star color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12" />
              <StarIcon color={color} className="h-7 w-7" />
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Take a lead off the map when…</h2>
        <p className="text-xs text-black/50 dark:text-white/50">
          It stays in List view and on the Leads tab here either way.
        </p>
        <p className="pt-1 text-xs font-medium">Its sub-dispo is</p>
        <CheckboxList
          options={dispositions.map((d) => ({ id: d.id, label: d.name, color: d.color }))}
          selected={hiddenDispositions}
          onChange={setHiddenDispositions}
        />
        <p className="pt-2 text-xs font-medium">An appointment set from it is marked</p>
        <CheckboxList
          options={statuses.map((s) => ({ id: s.id, label: s.name, color: s.color }))}
          selected={hiddenStatuses}
          onChange={setHiddenStatuses}
        />
      </section>

      {list.is_csc && (
        <section className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/10">
          <h2 className="text-sm font-medium">Automatic feed</h2>
          <p className="pt-1 text-xs font-medium">Never add appointments with status</p>
          <p className="text-xs text-black/50 dark:text-white/50">Applies going forward; leads already in the list stay.</p>
          <CheckboxList
            options={statuses.map((s) => ({ id: s.id, label: s.name, color: s.color }))}
            selected={excludedStatuses}
            onChange={setExcludedStatuses}
          />
          <p className="pt-3 text-xs font-medium">Never add appointments where the closer is</p>
          <p className="text-xs text-black/50 dark:text-white/50">
            Applies right away: their leads already in the list are removed too.
          </p>
          <Input
            value={closerQuery}
            onChange={(e) => setCloserQuery(e.target.value)}
            placeholder="Search people…"
            className="w-full"
          />
          {(closerQuery.trim() || excludedClosers.length > 0) && (
            <CheckboxList options={closerOptions} selected={excludedClosers} onChange={setExcludedClosers} />
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-black/10 pt-3 dark:border-white/10">
            <Button variant="secondary" size="sm" onClick={handleRunNow} disabled={isRunning}>
              {isRunning ? "Checking…" : "Run check now"}
            </Button>
            <span className="text-xs text-black/50 dark:text-white/50">
              {list.csc_last_run_at
                ? `Last checked ${new Date(list.csc_last_run_at).toLocaleString()}${
                    list.csc_last_run_summary ? ` — ${summaryText(list.csc_last_run_summary)}` : ""
                  }`
                : "Not checked yet"}
              . Runs automatically every morning.
            </span>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
          {isSaving ? "Saving…" : "Save settings"}
        </Button>
        {!list.is_csc && (
          <Button variant="secondary" onClick={handleDelete} disabled={isDeleting} className="text-red-600 dark:text-red-400">
            {isDeleting ? "Deleting…" : "Delete list"}
          </Button>
        )}
      </div>
      {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
