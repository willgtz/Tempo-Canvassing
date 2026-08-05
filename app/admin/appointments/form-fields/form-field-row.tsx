"use client";

import { useState, useTransition } from "react";
import { deleteFormField, updateFormField, type FieldType } from "./actions";

export type FormField = {
  id: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
};

const FIELD_TYPES: FieldType[] = ["text", "textarea", "number", "date", "select", "checkbox"];

export function FormFieldRow({ field }: { field: FormField }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [fieldType, setFieldType] = useState<FieldType>(field.field_type);
  const [optionsText, setOptionsText] = useState((field.options ?? []).join(", "));
  const [isRequired, setIsRequired] = useState(field.is_required);
  const [sortOrder, setSortOrder] = useState(String(field.sort_order));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    setLabel(field.label);
    setFieldType(field.field_type);
    setOptionsText((field.options ?? []).join(", "));
    setIsRequired(field.is_required);
    setSortOrder(String(field.sort_order));
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateFormField(field.id, {
        label,
        fieldType,
        options: fieldType === "select" ? optionsText.split(",") : null,
        isRequired,
        sortOrder: Number(sortOrder),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function handleDelete() {
    if (!confirm(`Delete field "${field.label}"?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteFormField(field.id);
      if (!result.ok) setError(result.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-t border-black/5 dark:border-white/10">
        <td className="px-3 py-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as FieldType)}
            className="rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {fieldType === "select" && (
            <input
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Option A, Option B, …"
              className="mt-1 w-full rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20 dark:bg-transparent"
            />
          )}
        </td>
        <td className="px-3 py-2">
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-20 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-2">
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="rounded border border-black/15 px-2 py-1 text-xs disabled:opacity-50 dark:border-white/20"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isPending}
              className="rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              Save
            </button>
          </div>
          {error && <p className="mt-1 text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-black/5 dark:border-white/10">
      <td className="px-3 py-2">{field.label}</td>
      <td className="px-3 py-2">
        {field.field_type}
        {field.field_type === "select" && field.options && (
          <span className="ml-1 text-xs text-black/50 dark:text-white/50">
            ({field.options.join(", ")})
          </span>
        )}
      </td>
      <td className="px-3 py-2">{field.is_required ? "Required" : ""}</td>
      <td className="px-3 py-2 tabular-nums">{field.sort_order}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded border border-black/15 px-2 py-1 text-xs dark:border-white/20"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
          >
            Delete
          </button>
        </div>
        {error && <p className="mt-1 text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
      </td>
    </tr>
  );
}
