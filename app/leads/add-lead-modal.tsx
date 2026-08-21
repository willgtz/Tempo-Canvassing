"use client";

import { useState, useTransition } from "react";
import { addManualLead } from "./actions";
import { useSlideIn } from "@/lib/use-slide-in";
import { cn } from "@/components/ui/cn";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import type { Lead } from "./types";

export function AddLeadModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (lead: Lead) => void;
}) {
  const visible = useSlideIn();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addManualLead({
        firstName: firstName || null,
        lastName: lastName || null,
        addressLine,
        city: city || null,
        state: state || null,
        zipcode,
        phone: phone || null,
        email: email || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAdded(result.lead);
    });
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-20 bg-black/40 backdrop-blur-md transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed left-1/2 top-1/2 z-30 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-black/10 bg-white p-6 shadow-xl transition-all duration-200 ease-out dark:border-white/10 dark:bg-neutral-950",
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Add Lead</h2>
          <button
            onClick={onClose}
            className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          For a cold-knocked door. Allowed in any zip, even one that isn&apos;t
          assigned to you — it&apos;ll be marked as manually entered.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
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
              <AddressAutocomplete
                value={addressLine}
                onChange={setAddressLine}
                onSelect={(result) => {
                  setAddressLine(result.addressLine);
                  if (result.city) setCity(result.city);
                  if (result.state) setState(result.state);
                  if (result.zipcode) setZipcode(result.zipcode);
                }}
                required
                className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
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
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isPending ? "Adding…" : "Add Lead"}
            </button>
            {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
          </div>
        </form>
      </div>
    </>
  );
}
