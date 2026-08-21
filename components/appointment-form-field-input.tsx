"use client";

import type { AppointmentFormField } from "@/app/leads/types";

// Renders one admin-configured appointment_form_fields entry (Additional
// Opener, Notes, or any other custom question) as the right input type
// for its field_type. Originally lived only in set-appointment-modal.tsx
// — pulled out shared so the manual-entry modal and the public
// no-account submission form render the exact same fields/behavior
// instead of drifting into three slightly different copies.
export function AppointmentFormFieldInput({
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
            className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
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
            className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
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
            className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
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
            className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
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
            className="w-full rounded border border-black/15 px-2 py-1 text-base sm:text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
      );
  }
}
