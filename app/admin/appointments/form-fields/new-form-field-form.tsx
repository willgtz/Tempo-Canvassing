"use client";

import { useState, useTransition } from "react";
import { createFormField, type FieldType } from "./actions";

const FIELD_TYPES: FieldType[] = ["text", "textarea", "number", "date", "select", "checkbox"];

export function NewFormFieldForm() {
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createFormField({
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
      setLabel("");
      setFieldType("text");
      setOptionsText("");
      setIsRequired(false);
      setSortOrder("0");
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium">Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          className="block w-48 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Type</label>
        <select
          value={fieldType}
          onChange={(e) => setFieldType(e.target.value as FieldType)}
          className="block rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {fieldType === "select" && (
        <div className="space-y-1">
          <label className="text-xs font-medium">Options (comma-separated)</label>
          <input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="Option A, Option B, …"
            className="block w-56 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
      )}
      <div className="space-y-1">
        <label className="text-xs font-medium">Sort order</label>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="block w-20 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      <label className="flex items-center gap-1.5 pb-1.5 text-xs font-medium">
        <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
        Required
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {isPending ? "Adding…" : "Add Field"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </form>
  );
}
