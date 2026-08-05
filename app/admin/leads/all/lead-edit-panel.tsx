"use client";

import { useState, useTransition } from "react";
import { updateLead } from "./actions";
import type { AdminLead, Disposition } from "./types";

export function LeadEditPanel({
  lead,
  dispositions,
  onClose,
  onSaved,
}: {
  lead: AdminLead;
  dispositions: Disposition[];
  onClose: () => void;
  onSaved: (lead: AdminLead) => void;
}) {
  const [firstName, setFirstName] = useState(lead.first_name ?? "");
  const [lastName, setLastName] = useState(lead.last_name ?? "");
  const [addressLine, setAddressLine] = useState(lead.address_line);
  const [city, setCity] = useState(lead.city ?? "");
  const [state, setState] = useState(lead.state ?? "");
  const [zipcode, setZipcode] = useState(lead.zipcode);
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [dispositionId, setDispositionId] = useState(lead.disposition_id ?? "");
  const [priorSaleDate, setPriorSaleDate] = useState(lead.prior_sale_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSave() {
    setError(null);
    startSaving(async () => {
      const result = await updateLead(lead.id, {
        firstName: firstName || null,
        lastName: lastName || null,
        addressLine,
        city: city || null,
        state: state || null,
        zipcode,
        phone: phone || null,
        email: email || null,
        dispositionId: dispositionId || null,
        priorSaleDate: priorSaleDate || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved({
        ...lead,
        first_name: firstName || null,
        last_name: lastName || null,
        address_line: addressLine,
        city: city || null,
        state: state || null,
        zipcode,
        phone: phone || null,
        email: email || null,
        disposition_id: dispositionId || null,
        prior_sale_date: priorSaleDate || null,
      });
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-30 h-full w-full max-w-md overflow-y-auto border-l border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Edit Lead</h2>
          <button
            onClick={onClose}
            className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Close
          </button>
        </div>

        {(lead.is_manual || lead.batch_filename) && (
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            {lead.is_manual ? "Manually entered" : `From batch: ${lead.batch_filename}`}
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium">First name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Last name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium">Address</label>
            <input
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              required
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">City</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">State</label>
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Zip</label>
            <input
              value={zipcode}
              onChange={(e) => setZipcode(e.target.value)}
              required
              inputMode="numeric"
              pattern="\d{5}"
              maxLength={5}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Disposition</label>
            <select
              value={dispositionId}
              onChange={(e) => setDispositionId(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            >
              <option value="">No disposition</option>
              {dispositions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Sold date</label>
            <input
              type="date"
              value={priorSaleDate}
              onChange={(e) => setPriorSaleDate(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-black/40 dark:text-white/40">
          Changing the address re-geocodes the pin automatically.
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </div>
    </>
  );
}
