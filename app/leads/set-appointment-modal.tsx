"use client";

import { useState, useTransition } from "react";
import { submitAppointment } from "./actions";
import type { AppointmentFormField, Lead } from "./types";

// Mirrors NewAppointmentSheet.swift: name/address pulled from the lead
// (name editable, per William's request — a rep can fix it here same as on
// iOS), a required date/time, then whatever's in appointment_form_fields
// rendered dynamically. No status or closer picked here — it always starts
// Unassigned (set_lead_appt_status_on_appointment / the default-status
// lookup in submitAppointment handle the rest server-side), and assignment
// is an admin action.
export function SetAppointmentModal({
  lead,
  formFields,
  onClose,
  onSubmitted,
}: {
  lead: Lead;
  formFields: AppointmentFormField[];
  onClose: () => void;
  onSubmitted: (updatedLead: Lead) => void;
}) {
  const originalName = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const [nameDraft, setNameDraft] = useState(originalName);
  const [scheduledAt, setScheduledAt] = useState(() => {
    // datetime-local wants "YYYY-MM-DDTHH:mm" in local time, no seconds/Z.
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
      const trimmedName = nameDraft.trim();
      const nameChanged = trimmedName.length > 0 && trimmedName !== originalName;
      const parts = trimmedName.split(/\s+/);
      const updatedFirstName = nameChanged ? (parts[0] ?? null) : null;
      const updatedLastName = nameChanged ? (parts.slice(1).join(" ") || null) : null;

      const result = await submitAppointment({
        leadId: lead.id,
        scheduledAt: new Date(scheduledAt).toISOString(),
        responses,
        nameChanged,
        updatedFirstName,
        updatedLastName,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSubmitted(result.updatedLead);
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-30 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Set Appointment</h2>
          <button
            onClick={onClose}
            className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto">
          <div className="space-y-1">
            <label className="text-xs font-medium">Customer name</label>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>

          <p className="text-sm text-black/60 dark:text-white/60">
            {lead.address_line}
            <br />
            {[lead.city, lead.state, lead.zipcode].filter(Boolean).join(", ")}
          </p>

          <div className="space-y-1">
            <label className="text-xs font-medium">Date &amp; time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>

          {formFields.map((field) => (
            <FormFieldInput
              key={field.id}
              field={field}
              value={responses[field.id] ?? ""}
              onChange={(value) => setResponse(field.id, value)}
            />
          ))}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending || missingRequired.length > 0}
              className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isPending ? "Submitting…" : "Submit"}
            </button>
            {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
          </div>
        </form>
      </div>
    </>
  );
}

function FormFieldInput({
  field,
  value,
  onChange,
}: {
  field: AppointmentFormField;
  value: string;
  onChange: (value: string) => void;
}) {
  const label = `${field.label}${field.is_required ? " *" : ""}`;

  switch (field.field_type) {
    case "textarea":
      return (
        <div className="space-y-1">
          <label className="text-xs font-medium">{label}</label>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
      );
    case "number":
      return (
        <div className="space-y-1">
          <label className="text-xs font-medium">{label}</label>
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
      );
    case "date":
      return (
        <div className="space-y-1">
          <label className="text-xs font-medium">{label}</label>
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
      );
    case "select":
      return (
        <div className="space-y-1">
          <label className="text-xs font-medium">{label}</label>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          />
          {field.label}
        </label>
      );
    case "text":
    default:
      return (
        <div className="space-y-1">
          <label className="text-xs font-medium">{label}</label>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
      );
  }
}
