"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_SPECIAL_LIST_COLOR } from "@/lib/special-lists";
import { createSpecialList } from "./actions";

export function NewSpecialListForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_SPECIAL_LIST_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createSpecialList(name, color);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/leads/special-lists/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <p className="text-sm font-medium">New list</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="List name"
          className="min-w-0 flex-1"
          maxLength={60}
        />
        <label className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
          Star color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12" />
        </label>
        <Button type="submit" size="md" disabled={isPending || !name.trim()}>
          {isPending ? "Creating…" : "+ New List"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
