"use client";

import { useState, useTransition } from "react";
import { setDoorKnockGoal } from "@/app/dashboard/actions";
import { deriveGoalStatus, formatStatValue } from "@/lib/dashboard/stats";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type GoalRow = {
  goal_id: string;
  target_count: number;
  start_date: string;
  end_date: string;
  verified_count: number;
};

export function DoorKnockGoalCard({
  currentGoal,
  pastGoals,
  today,
}: {
  currentGoal: GoalRow | null;
  pastGoals: GoalRow[];
  today: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [target, setTarget] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const status = currentGoal ? deriveGoalStatus(currentGoal, currentGoal.verified_count, today) : null;
  // Matches setDoorKnockGoal's own server-side check exactly — UI
  // convenience only, the real gate is on the server.
  const canSetNewGoal = !currentGoal || today > currentGoal.end_date;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setDoorKnockGoal({
        targetCount: Number(target),
        startDate: start,
        endDate: end,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setTarget("");
      setStart("");
      setEnd("");
    });
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-medium">Door-Knock Goal</h2>

      {currentGoal && status && (
        <div
          className={
            status === "achieved"
              ? "rounded-lg bg-green-100 p-3 text-green-900 dark:bg-green-900/30 dark:text-green-300"
              : status === "failed"
                ? "rounded-lg bg-red-100 p-3 text-red-900 dark:bg-red-900/30 dark:text-red-300"
                : "rounded-lg bg-black/5 p-3 dark:bg-white/5"
          }
        >
          <p className="text-2xl font-semibold">
            {formatStatValue(currentGoal.verified_count)} / {formatStatValue(currentGoal.target_count)}
          </p>
          <p className="text-xs">
            {currentGoal.start_date} – {currentGoal.end_date}
          </p>
          {status === "achieved" && <p className="mt-1 text-sm font-medium">Goal achieved!</p>}
          {status === "failed" && <p className="mt-1 text-sm font-medium">Goal failed</p>}
        </div>
      )}

      {!currentGoal && !showForm && (
        <p className="text-sm italic text-black/40 dark:text-white/40">No goal set yet.</p>
      )}

      {canSetNewGoal && !showForm && (
        <Button size="sm" onClick={() => setShowForm(true)}>
          Set Goal
        </Button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            type="number"
            min={1}
            required
            placeholder="Target knocks"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full"
          />
          <div className="flex gap-2">
            <Input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full"
            />
            <Input
              type="date"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving…" : "Save Goal"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </form>
      )}

      {pastGoals.length > 0 && (
        <details className="pt-2">
          <summary className="cursor-pointer text-xs font-medium text-black/60 dark:text-white/60">
            Past goals ({pastGoals.length})
          </summary>
          <ul className="mt-2 space-y-1 text-xs">
            {pastGoals.map((g) => {
              const s = deriveGoalStatus(g, g.verified_count, today);
              return (
                <li key={g.goal_id}>
                  {g.start_date}–{g.end_date}: {g.verified_count}/{g.target_count} —{" "}
                  <span
                    className={
                      s === "achieved"
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }
                  >
                    {s === "achieved" ? "Achieved" : "Failed"}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </Card>
  );
}
