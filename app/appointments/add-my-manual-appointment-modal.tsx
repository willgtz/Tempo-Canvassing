"use client";

import { useState, useTransition } from "react";
import { addMyManualAppointment } from "./actions";
import { useSlideIn } from "@/lib/use-slide-in";
import { cn } from "@/components/ui/cn";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { AppointmentFormFieldInput } from "@/components/appointment-form-field-input";
import type { Appointment, AppointmentLead } from "@/app/admin/appointments/types";
import type { AppointmentFormField } from "@/app/leads/types";

// Rep-facing counterpart to app/admin/appointments/add-manual-appointment-
// modal.tsx — same fields/flow, calls addMyManualAppointment instead
// (self-assigns the creator as opener so they can see it again
// afterward; appointments_select RLS requires admin or an assignment).
export function AddMyManualAppointmentModal({
  formFields,
  onClose,
  onCreated,
}: {
  formFields: AppointmentFormField[];
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
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setResponse(fieldId: string, value: string) {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
  }

  const missingRequired = formFields.filter(
    (f) => f.is_required && !(responses[f.id] ?? "").trim()
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addMyManualAppointment({
        firstName: firstName || null,
        lastName: lastName || null,
        addressLine,
        city: city || null,
        state: state || null,
        zipcode,
        scheduledAt: new Date(scheduledAt).toISOString(),
        responses,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.appointment, result.lead);
    });
  }

  const fieldClass =
    "w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent";

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
          "fixed left-1/2 top-1/2 z-30 max-h-[85vh] w-full max-w-md overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-lg border border-black/10 bg-white p-6 shadow-xl transition-all duration-200 ease-out dark:border-white/10 dark:bg-neutral-950",
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
          For an appointment that didn&apos;t come from working a lead — creates a manually-marked
          lead behind the scenes, same as Add Lead does. Only you (and admins) will see it.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={fieldClass}
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
                className={fieldClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">State</label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                className={fieldClass}
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
                className={fieldClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Date &amp; time</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                className={fieldClass}
              />
            </div>
          </div>

          {formFields.length > 0 && (
            <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
              {formFields.map((field) => (
                <AppointmentFormFieldInput
                  key={field.id}
                  field={field}
                  value={responses[field.id] ?? ""}
                  onChange={(value) => setResponse(field.id, value)}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending || missingRequired.length > 0}
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
