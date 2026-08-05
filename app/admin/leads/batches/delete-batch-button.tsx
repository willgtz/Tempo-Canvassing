"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBatch } from "./actions";

export function DeleteBatchButton({
  batchId,
  filename,
  redirectTo,
}: {
  batchId: string;
  filename: string | null;
  redirectTo?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleDelete() {
    const ok = confirm(
      `Delete batch "${filename ?? batchId}" and all of its leads? This can't be undone and removes them for every user.`
    );
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteBatch(batchId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
      >
        {isPending ? "Deleting…" : "Delete batch"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
