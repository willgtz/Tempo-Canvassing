"use client";

import { useEffect, useState, useTransition } from "react";
import { updateLeadDisposition, updateLeadPriorSaleDate, addLeadNote } from "./actions";
import { SetAppointmentModal } from "./set-appointment-modal";
import { getCurrentLocation, distanceFeet } from "@/lib/geo";
import type { AppointmentFormField, Disposition, Lead } from "./types";

type Note = {
  id: string;
  note: string;
  created_at: string;
  author_name: string;
};

type HistoryEntry = {
  id: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  authorName: string;
};

export function LeadDetailPanel({
  lead,
  dispositions,
  appointmentFormFields,
  isAdmin,
  doorKnockRadiusFeet,
  onClose,
  onDispositionSaved,
  onPriorSaleDateSaved,
  onLeadUpdated,
}: {
  lead: Lead;
  dispositions: Disposition[];
  appointmentFormFields: AppointmentFormField[];
  isAdmin: boolean;
  doorKnockRadiusFeet: number;
  onClose: () => void;
  onDispositionSaved: (leadId: string, dispositionId: string | null) => void;
  onPriorSaleDateSaved: (leadId: string, priorSaleDate: string | null) => void;
  onLeadUpdated: (lead: Lead) => void;
}) {
  const [showSetAppointment, setShowSetAppointment] = useState(false);
  const [dispositionId, setDispositionId] = useState(lead.disposition_id ?? "");
  const [dispositionError, setDispositionError] = useState<string | null>(null);
  const [isSavingDisposition, startDispositionSave] = useTransition();
  const [doorKnockNotice, setDoorKnockNotice] = useState<string | null>(null);

  const [priorSaleDate, setPriorSaleDate] = useState(lead.prior_sale_date ?? "");
  const [priorSaleDateError, setPriorSaleDateError] = useState<string | null>(null);
  const [isSavingPriorSaleDate, startPriorSaleDateSave] = useTransition();

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSavingNote, startNoteSave] = useTransition();

  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leads/${lead.id}/notes`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load notes.");
        return (await res.json()) as Note[];
      })
      .then((data) => {
        if (!cancelled) setNotes(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setNotesError(err.message);
      });

    fetch(`/api/leads/${lead.id}/history`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load history.");
        return (await res.json()) as HistoryEntry[];
      })
      .then((data) => {
        if (!cancelled) setHistory(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setHistoryError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [lead.id]);

  const dispositionChanged = (dispositionId || null) !== (lead.disposition_id ?? null);
  const priorSaleDateChanged = (priorSaleDate || null) !== (lead.prior_sale_date ?? null);

  // Auto-dismisses after a few seconds — this is a brief, non-blocking
  // notice (the door-knock plan's "soft check": the save always happens
  // regardless), not something that should linger and require dismissal.
  useEffect(() => {
    if (!doorKnockNotice) return;
    const t = setTimeout(() => setDoorKnockNotice(null), 4000);
    return () => clearTimeout(t);
  }, [doorKnockNotice]);

  // Best-effort location capture for door-knock verification — a
  // disposition change or note add always saves either way (this is the
  // "soft check" from the door-knock plan), this only decides what
  // (if anything) to tell the rep about it. The DB trigger
  // (compute_door_knock_verification*, schema.sql) is the actual system
  // of record and always recomputes verified/distance_ft itself from
  // the coordinates passed to the server action below.
  async function captureDoorKnockLocation(): Promise<{ lat?: number; lng?: number }> {
    let location: { lat: number; lng: number } | null = null;
    try {
      location = await getCurrentLocation();
    } catch {
      // Falls through to the "can't verify your location" notice below.
    }

    if (lead.lat == null || lead.lng == null) {
      setDoorKnockNotice("Can't verify — this lead has no location on file");
    } else if (!location) {
      setDoorKnockNotice("Can't verify your location");
    } else {
      const distance = distanceFeet(location.lat, location.lng, lead.lat, lead.lng);
      if (distance > doorKnockRadiusFeet) {
        setDoorKnockNotice("Too far from lead — won't count toward your door count");
      }
      // In range: no notice, silent normal save.
    }

    return location ? { lat: location.lat, lng: location.lng } : {};
  }

  function handleSavePriorSaleDate() {
    setPriorSaleDateError(null);
    startPriorSaleDateSave(async () => {
      const result = await updateLeadPriorSaleDate(lead.id, priorSaleDate || null);
      if (!result.ok) {
        setPriorSaleDateError(result.error);
        return;
      }
      onPriorSaleDateSaved(lead.id, priorSaleDate || null);
    });
  }

  function handleSaveDisposition() {
    setDispositionError(null);
    startDispositionSave(async () => {
      const { lat, lng } = await captureDoorKnockLocation();
      const result = await updateLeadDisposition(lead.id, dispositionId || null, lat, lng);
      if (!result.ok) {
        setDispositionError(result.error);
        return;
      }
      onDispositionSaved(lead.id, dispositionId || null);
    });
  }

  function handleSaveNote() {
    const text = newNote.trim();
    if (!text) return;
    setNoteError(null);
    startNoteSave(async () => {
      const { lat, lng } = await captureDoorKnockLocation();
      const result = await addLeadNote(lead.id, text, lat, lng);
      if (!result.ok) {
        setNoteError(result.error);
        return;
      }
      setNotes((prev) => [result.note, ...(prev ?? [])]);
      setNewNote("");
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      {doorKnockNotice && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div className="rounded-full bg-black/90 px-4 py-2 text-center text-sm text-white shadow-lg dark:bg-white/90 dark:text-black">
            {doorKnockNotice}
          </div>
        </div>
      )}
      <div className="fixed right-0 top-0 z-30 h-full w-full max-w-md overflow-y-auto border-l border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Lead"}
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Close
          </button>
        </div>

        <p className="mt-1 text-sm text-black/70 dark:text-white/70">
          {lead.address_line}
          <br />
          {[lead.city, lead.state, lead.zipcode].filter(Boolean).join(", ")}
        </p>

        {lead.is_manual && (
          <p className="mt-2 inline-block rounded border border-black/20 px-2 py-1 text-xs text-black/60 dark:border-white/30 dark:text-white/60">
            Entered manually by {lead.entered_by_name ?? "Unknown"} — may be outside their
            assigned zip.
          </p>
        )}

        <button
          onClick={() => setShowSetAppointment(true)}
          className="mt-3 rounded border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Set Appointment
        </button>

        {isAdmin ? (
          <div className="mt-4 space-y-2">
            <label className="text-xs font-medium">Sold Date</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={priorSaleDate}
                onChange={(e) => setPriorSaleDate(e.target.value)}
                className="rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              />
              <button
                onClick={handleSavePriorSaleDate}
                disabled={!priorSaleDateChanged || isSavingPriorSaleDate}
                className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {isSavingPriorSaleDate ? "Saving…" : "Save"}
              </button>
            </div>
            {priorSaleDateError && (
              <p className="text-xs text-red-600 dark:text-red-400">{priorSaleDateError}</p>
            )}
          </div>
        ) : (
          lead.prior_sale_date && (
            <p className="mt-2 text-sm text-black/70 dark:text-white/70">
              Sold {new Date(`${lead.prior_sale_date}T00:00:00`).toLocaleDateString()}
            </p>
          )
        )}

        <div className="mt-6 space-y-2">
          <label className="text-xs font-medium">Disposition</label>
          <div className="flex items-center gap-2">
            <select
              value={dispositionId}
              onChange={(e) => setDispositionId(e.target.value)}
              className="rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            >
              <option value="">No disposition</option>
              {dispositions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveDisposition}
              disabled={!dispositionChanged || isSavingDisposition}
              className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isSavingDisposition ? "Saving…" : "Save"}
            </button>
          </div>
          {dispositionError && (
            <p className="text-xs text-red-600 dark:text-red-400">{dispositionError}</p>
          )}
        </div>

        <div className="mt-8 space-y-3">
          <h3 className="text-sm font-medium">Notes</h3>

          <div className="space-y-1">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              placeholder="Add a note…"
              className="w-full rounded border border-black/15 px-2 py-1 text-base md:text-sm dark:border-white/20 dark:bg-transparent"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveNote}
                disabled={!newNote.trim() || isSavingNote}
                className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                {isSavingNote ? "Saving…" : "Save Note"}
              </button>
              {noteError && (
                <span className="text-xs text-red-600 dark:text-red-400">{noteError}</span>
              )}
            </div>
            <p className="text-xs text-black/40 dark:text-white/40">
              Notes can&apos;t be edited or deleted once saved.
            </p>
          </div>

          <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
            {notesError && <p className="text-xs text-red-600 dark:text-red-400">{notesError}</p>}
            {notes === null && !notesError && (
              <p className="text-xs text-black/50 dark:text-white/50">Loading notes…</p>
            )}
            {notes?.length === 0 && (
              <p className="text-xs italic text-black/40 dark:text-white/40">No notes yet.</p>
            )}
            {notes?.map((n) => (
              <div key={n.id} className="text-sm">
                <p className="text-xs text-black/50 dark:text-white/50">
                  {n.author_name} · {new Date(n.created_at).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap">{n.note}</p>
              </div>
            ))}
          </div>
        </div>

        <details className="mt-8">
          <summary className="cursor-pointer select-none text-sm font-medium">History</summary>
          <div className="mt-3 space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
            {historyError && <p className="text-xs text-red-600 dark:text-red-400">{historyError}</p>}
            {history === null && !historyError && (
              <p className="text-xs text-black/50 dark:text-white/50">Loading history…</p>
            )}
            {history?.length === 0 && (
              <p className="text-xs italic text-black/40 dark:text-white/40">No history yet.</p>
            )}
            {history?.map((h) => (
              <div key={h.id} className="text-sm">
                <p className="text-xs text-black/50 dark:text-white/50">
                  {h.authorName} · {new Date(h.changedAt).toLocaleString()}
                </p>
                <p>
                  {h.fieldChanged}: {h.oldValue ?? "—"} → {h.newValue ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </details>
      </div>

      {showSetAppointment && (
        <SetAppointmentModal
          lead={lead}
          formFields={appointmentFormFields}
          onClose={() => setShowSetAppointment(false)}
          onSubmitted={(updatedLead) => {
            onLeadUpdated(updatedLead);
            setShowSetAppointment(false);
          }}
        />
      )}
    </>
  );
}
