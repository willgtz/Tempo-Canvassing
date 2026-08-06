"use client";

import { useMemo, useState, useTransition } from "react";
import {
  grantDoorKnockVisibility,
  revokeDoorKnockVisibility,
  updateDoorKnockRadius,
} from "../reps/actions";

type Profile = { id: string; full_name: string };
type Grant = { id: string; granteeId: string; targetId: string };

export function DoorKnockSettingsClient({
  radiusFeet,
  profiles,
  initialGrants,
}: {
  radiusFeet: number;
  profiles: Profile[];
  initialGrants: Grant[];
}) {
  const nameById = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);

  const [radiusInput, setRadiusInput] = useState(String(radiusFeet));
  const [radiusError, setRadiusError] = useState<string | null>(null);
  const [radiusSaved, setRadiusSaved] = useState(false);
  const [isSavingRadius, startRadiusSave] = useTransition();

  const [grants, setGrants] = useState(initialGrants);
  const [granteeId, setGranteeId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [grantError, setGrantError] = useState<string | null>(null);
  const [isSavingGrant, startGrantSave] = useTransition();

  function handleSaveRadius() {
    setRadiusError(null);
    setRadiusSaved(false);
    const feet = Number(radiusInput);
    startRadiusSave(async () => {
      const result = await updateDoorKnockRadius(feet);
      if (!result.ok) {
        setRadiusError(result.error);
        return;
      }
      setRadiusSaved(true);
    });
  }

  function handleAddGrant(e: React.FormEvent) {
    e.preventDefault();
    setGrantError(null);
    if (!granteeId || !targetId) {
      setGrantError("Pick both a grantee and a target.");
      return;
    }
    startGrantSave(async () => {
      const result = await grantDoorKnockVisibility(granteeId, targetId);
      if (!result.ok) {
        setGrantError(result.error);
        return;
      }
      setGrants((prev) => [
        { id: result.grant.id, granteeId: result.grant.granteeId, targetId: result.grant.targetId },
        ...prev,
      ]);
      setTargetId("");
    });
  }

  function handleRemoveGrant(grantId: string) {
    setGrantError(null);
    startGrantSave(async () => {
      const result = await revokeDoorKnockVisibility(grantId);
      if (!result.ok) {
        setGrantError(result.error);
        return;
      }
      setGrants((prev) => prev.filter((g) => g.id !== grantId));
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Door-knock verification radius and per-user visibility into other
          people&apos;s door-knock counts.
        </p>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-sm font-medium">Door-knock verification radius</h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          A disposition change or note only counts toward a rep&apos;s door
          count if their device location was within this distance of the
          lead&apos;s saved address at the time. The change/note itself always
          saves either way — this only affects whether it&apos;s counted.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={radiusInput}
            onChange={(e) => {
              setRadiusInput(e.target.value);
              setRadiusSaved(false);
            }}
            className="w-24 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
          <span className="text-sm text-black/60 dark:text-white/60">feet</span>
          <button
            onClick={handleSaveRadius}
            disabled={isSavingRadius}
            className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {isSavingRadius ? "Saving…" : "Save"}
          </button>
          {radiusSaved && <span className="text-sm text-green-700 dark:text-green-500">Saved.</span>}
          {radiusError && <span className="text-sm text-red-600 dark:text-red-400">{radiusError}</span>}
        </div>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h2 className="text-sm font-medium">Door-knock visibility grants</h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Give one person visibility into another specific person&apos;s door
          count on their dashboard — one-directional, and independent of the
          company-wide leaderboard toggle (Reps → Edit). For example, grant
          Ricky visibility into Ryan&apos;s count without Ryan seeing
          Ricky&apos;s.
        </p>

        <form onSubmit={handleAddGrant} className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={granteeId}
            onChange={(e) => setGranteeId(e.target.value)}
            className="rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="">Grantee (who sees)…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <span className="text-sm text-black/50 dark:text-white/50">can see</span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          >
            <option value="">Target (whose count)…</option>
            {profiles
              .filter((p) => p.id !== granteeId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
          </select>
          <button
            type="submit"
            disabled={isSavingGrant}
            className="rounded border border-black/15 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20"
          >
            Add
          </button>
          {grantError && <span className="text-sm text-red-600 dark:text-red-400">{grantError}</span>}
        </form>

        <div className="mt-3 space-y-1">
          {grants.length === 0 && (
            <p className="text-sm italic text-black/40 dark:text-white/40">No grants yet.</p>
          )}
          {grants.map((g) => (
            <div key={g.id} className="flex items-center justify-between text-sm">
              <span>
                <span className="font-medium">{nameById.get(g.granteeId) ?? "Unknown"}</span> can see{" "}
                <span className="font-medium">{nameById.get(g.targetId) ?? "Unknown"}</span>
              </span>
              <button
                onClick={() => handleRemoveGrant(g.id)}
                disabled={isSavingGrant}
                className="text-xs text-black/50 hover:text-black disabled:opacity-50 dark:text-white/50 dark:hover:text-white"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
