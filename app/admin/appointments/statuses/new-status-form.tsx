"use client";

import { useState, useTransition } from "react";
import { createStatus } from "./actions";

export function NewStatusForm() {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6B7280");
  const [sortOrder, setSortOrder] = useState("0");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createStatus({
        name,
        color,
        sortOrder: Number(sortOrder),
        isDefault,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setColor("#6B7280");
      setSortOrder("0");
      setIsDefault(false);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10"
    >
      <div className="space-y-1">
        <label className="text-xs font-medium">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="block w-40 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Color</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="block h-8 w-14" />
      </div>
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
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Default for new appointments
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {isPending ? "Adding…" : "Add Status"}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </form>
  );
}
