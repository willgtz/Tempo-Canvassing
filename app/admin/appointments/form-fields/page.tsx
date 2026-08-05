import { createClient } from "@/lib/supabase/server";
import { FormFieldRow } from "./form-field-row";
import { NewFormFieldForm } from "./new-form-field-form";

export default async function AppointmentFormFieldsPage() {
  const supabase = await createClient();
  const { data: fields, error } = await supabase
    .from("appointment_form_fields")
    .select("id, label, field_type, options, is_required, sort_order")
    .order("sort_order");

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6 text-sm text-red-600 dark:text-red-400">
        Failed to load submission form fields: {error.message}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Appointment Submission Form</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          These questions appear on both the iOS and web &quot;Set Appointment&quot; forms, in sort
          order. A field labeled with &quot;notes&quot; anywhere in its name is shown as the
          appointment&apos;s own note (distinct card) on the detail screen instead of a plain
          submission answer — keep that in mind before renaming the existing Notes field.
        </p>
      </div>

      <NewFormFieldForm />

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 font-medium">Label</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Required</th>
              <th className="px-3 py-2 font-medium">Sort Order</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(fields ?? []).map((f) => (
              <FormFieldRow key={f.id} field={f} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
