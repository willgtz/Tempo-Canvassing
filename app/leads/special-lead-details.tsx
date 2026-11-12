"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getSpecialLeadDetails } from "./actions";
import type { SpecialLeadDetails, SpecialLeadSource } from "@/lib/special-lists";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function names(list: string[]) {
  return list.length > 0 ? list.join(", ") : "—";
}

const HISTORY_LABELS: Record<string, string> = { scheduled_at: "Rescheduled" };

function formatHistoryValue(field: string, value: string | null) {
  if (!value) return "—";
  if (field === "scheduled_at") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return formatDateTime(value);
  }
  return value;
}

function SourceAppointment({ source, isAdmin, defaultOpen }: { source: SpecialLeadSource; isAdmin: boolean; defaultOpen: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-black/10 p-3 dark:border-white/10">
      <summary className="cursor-pointer select-none text-sm">
        <span className="font-medium">{formatDateTime(source.scheduled_at)}</span>{" "}
        <Badge color={source.status_color} className="ml-1 align-middle">
          {source.status_name}
        </Badge>
      </summary>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-black/50 dark:text-white/50">Opener</dt>
        <dd>{names(source.openers)}</dd>
        <dt className="text-black/50 dark:text-white/50">Closer</dt>
        <dd>{names(source.closers)}</dd>
        <dt className="text-black/50 dark:text-white/50">Set on</dt>
        <dd>
          {formatDateTime(source.created_at)}
          {source.created_by_name ? ` by ${source.created_by_name}` : ""}
        </dd>
        <dt className="text-black/50 dark:text-white/50">Added to list</dt>
        <dd>{formatDateTime(source.added_at)}</dd>
        {source.responses.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-black/50 dark:text-white/50">{r.label}</dt>
            <dd className="whitespace-pre-wrap break-words">{r.value}</dd>
          </div>
        ))}
      </dl>

      {source.hics.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium">HICs</p>
          {source.hics.map((h, i) => (
            <p key={i} className="text-sm">
              {h.financing ?? "HIC"} · <span className="capitalize">{h.status.replace(/_/g, " ")}</span>
              {h.contract_price != null && ` · $${Number(h.contract_price).toLocaleString()}`}
              {h.system_size_kw != null && ` · ${h.system_size_kw} kW`}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium">Original notes</p>
        {source.notes.length === 0 ? (
          <p className="text-xs italic text-black/40 dark:text-white/40">No notes on the original appointment.</p>
        ) : (
          source.notes.map((n, i) => (
            <div key={i} className="rounded bg-black/[0.03] p-2 text-sm dark:bg-white/[0.05]">
              <p className="text-xs text-black/50 dark:text-white/50">
                {n.author_name} · {formatDateTime(n.created_at)}
              </p>
              <p className="whitespace-pre-wrap">{n.note}</p>
            </div>
          ))
        )}
      </div>

      {source.history.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium">Original history</p>
          {source.history.map((h, i) => (
            <p key={i} className="text-xs text-black/70 dark:text-white/70">
              {formatDateTime(h.changed_at)} · {h.author_name}: {HISTORY_LABELS[h.field_changed] ?? h.field_changed}{" "}
              {formatHistoryValue(h.field_changed, h.old_value)} → {formatHistoryValue(h.field_changed, h.new_value)}
            </p>
          ))}
        </div>
      )}

      {isAdmin && (
        <Link
          href={`/admin/appointments?appointment=${source.appointment_id}`}
          className="mt-3 inline-block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Open original appointment
        </Link>
      )}
    </details>
  );
}

// Read-only. Notes added here go on the special lead itself, never on
// the original appointment.
export function SpecialLeadDetailsSection({ leadId, isAdmin }: { leadId: string; isAdmin: boolean }) {
  const [details, setDetails] = useState<SpecialLeadDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSpecialLeadDetails(leadId).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetails(result.details);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (error) return <p className="mt-6 text-xs text-red-600 dark:text-red-400">{error}</p>;
  if (!details) return <p className="mt-6 text-xs text-black/50 dark:text-white/50">Loading appointment details…</p>;
  if (details.sources.length === 0 && details.appointments.length === 0) return null;

  return (
    <div className="mt-6 space-y-4 border-t border-black/10 pt-4 dark:border-white/10">
      {details.sources.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Original appointment{details.sources.length === 1 ? "" : "s"}
          </h3>
          {details.sources.map((source, i) => (
            <SourceAppointment key={source.appointment_id} source={source} isAdmin={isAdmin} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      {details.appointments.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Appointments set from this lead</h3>
          {details.appointments.map((a) => (
            <div key={a.appointment_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>{formatDateTime(a.scheduled_at)}</span>
              <Badge color={a.status_color}>{a.status_name}</Badge>
              <span className="text-xs text-black/50 dark:text-white/50">
                Set by {a.created_by_name ?? "Unknown"}
                {a.closers.length > 0 && ` · Closer ${a.closers.join(", ")}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
