"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { AppointmentFormFieldInput } from "@/components/appointment-form-field-input";
import type { AppointmentFormField } from "@/app/leads/types";

const ZIP_RE = /^\d{5}$/;

export function PublicAppointmentRequestForm({
  formFields,
}: {
  formFields: AppointmentFormField[];
}) {
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function setResponse(fieldId: string, value: string) {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
  }

  const missingRequired = formFields.filter(
    (f) => f.is_required && !(responses[f.id] ?? "").trim()
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!ZIP_RE.test(zipcode.trim())) {
      setError("Zip must be exactly 5 digits.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/public/appointment-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName || null,
          lastName: lastName || null,
          addressLine,
          city: city || null,
          state: state || null,
          zipcode,
          scheduledAt: new Date(scheduledAt).toISOString(),
          responses,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md p-6 text-center">
          <h1 className="text-xl font-semibold">Request submitted</h1>
          <p className="mt-2 text-sm text-black/60 dark:text-white/60">
            Thanks — this appointment has been added and the team will see it.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 justify-center px-4 py-10">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-semibold">Request an Appointment</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          No account needed — fill this out and the team will see it come in.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">First name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1.5 text-base dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Last name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1.5 text-base dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium">Address *</label>
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
                className="w-full rounded border border-black/15 px-2 py-1.5 text-base dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1.5 text-base dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">State</label>
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1.5 text-base dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Zip *</label>
              <input
                value={zipcode}
                onChange={(e) => setZipcode(e.target.value)}
                required
                inputMode="numeric"
                pattern="\d{5}"
                maxLength={5}
                className="w-full rounded border border-black/15 px-2 py-1.5 text-base dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Date &amp; time *</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                required
                className="w-full rounded border border-black/15 px-2 py-1.5 text-base dark:border-white/20 dark:bg-transparent"
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

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" disabled={isSubmitting || missingRequired.length > 0} className="w-full">
            {isSubmitting ? "Submitting…" : "Submit Request"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
