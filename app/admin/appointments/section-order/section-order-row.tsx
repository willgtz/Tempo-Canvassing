"use client";

import { useState, useTransition } from "react";
import { updateSectionOrder } from "./actions";

export type DetailSection = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
};

export function SectionOrderRow({ section }: { section: DetailSection }) {
  const [sortOrder, setSortOrder] = useState(String(section.sort_order));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = sortOrder !== String(section.sort_order);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateSectionOrder(section.id, Number(sortOrder));
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <tr className="border-t border-black/5 dark:border-white/10">
      <td className="px-3 py-2">{section.label}</td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="w-20 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={handleSave}
          disabled={isPending || !isDirty}
          className="rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {error && <p className="mt-1 text-right text-xs text-red-600 dark:text-red-400">{error}</p>}
      </td>
    </tr>
  );
}
