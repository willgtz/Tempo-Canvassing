"use client";

import { useState, useTransition } from "react";
import { updateStatus, deleteStatus } from "./actions";

export type Status = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_default: boolean;
};

export function StatusRow({ status }: { status: Status }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(status.name);
  const [color, setColor] = useState(status.color);
  const [sortOrder, setSortOrder] = useState(String(status.sort_order));
  const [isDefault, setIsDefault] = useState(status.is_default);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    setName(status.name);
    setColor(status.color);
    setSortOrder(String(status.sort_order));
    setIsDefault(status.is_default);
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateStatus(status.id, {
        name,
        color,
        sortOrder: Number(sortOrder),
        isDefault,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function handleDelete() {
    if (!confirm(`Delete status "${status.name}"?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteStatus(status.id);
      if (!result.ok) setError(result.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-t border-black/5 dark:border-white/10">
        <td className="px-3 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </td>
        <td className="px-3 py-2">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-14" />
        </td>
        <td className="px-3 py-2">
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-20 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </td>
        <td className="px-3 py-2">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
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
      <td className="px-3 py-2">{status.name}</td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-full border border-black/10 dark:border-white/20"
            style={{ backgroundColor: status.color }}
          />
          <span className="text-xs text-black/60 dark:text-white/60">{status.color}</span>
        </span>
      </td>
      <td className="px-3 py-2 tabular-nums">{status.sort_order}</td>
      <td className="px-3 py-2">{status.is_default ? "Default" : ""}</td>
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
