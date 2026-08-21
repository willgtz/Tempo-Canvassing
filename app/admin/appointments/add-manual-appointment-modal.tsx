"use client";

import { useState, useTransition } from "react";
import { addManualAppointment } from "./actions";
import { useSlideIn } from "@/lib/use-slide-in";
import { cn } from "@/components/ui/cn";
import type { Appointment, AppointmentLead } from "./types";

// Same shape/flow as app/leads/add-lead-modal.tsx, but creates an
// appointment in the same step — for a design-request-type appointment
// that didn't come from a rep knocking a door via the Leads flow.
export function AddManualAppointmentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (appointment: Appointment, lead: AppointmentLead) => void;
}) {
  const visible = useSlideIn();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addManualAppointment({
        firstName: firstName || null,
        lastName: lastName || null,
        addressLine,
        city: city || null,
        state: state || null,
        zipcode,
        scheduledAt: new Date(scheduledAt).toISOString(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.appointment, result.lead);
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
          <h2 className="text-lg font-semibold">New Appointment</h2>
          <button
            onClick={onClose}
            className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          For an appointment that didn&apos;t come from a rep in the field — e.g. a design request
          phoned or emailed in directly. Creates a manually-marked lead behind the scenes, same as
          Add Lead does.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium">Address</label>
              <input
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                required
                className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">State</label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
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
                className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Date &amp; time</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isPending ? "Creating…" : "Create Appointment"}
            </button>
            {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
          </div>
        </form>
      </div>
    </>
  );
}
