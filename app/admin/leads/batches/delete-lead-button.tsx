"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteManualLead } from "./actions";

export function DeleteLeadButton({
  leadId,
  addressLine,
}: {
  leadId: string;
  addressLine: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleDelete() {
    const ok = confirm(`Delete the manually-entered lead at "${addressLine}"? This can't be undone.`);
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteManualLead(leadId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
