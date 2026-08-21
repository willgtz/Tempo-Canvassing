"use client";

import { useMemo, useState, useTransition } from "react";
import { grantDoorKnockVisibility, revokeDoorKnockVisibility, updateDoorKnockRadius } from "../actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

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
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
  const [grantError, setGrantError] = useState<string | null>(null);
  const [isSavingGrant, startGrantSave] = useTransition();

  // Grants this grantee already has, so the checkbox list doesn't offer
  // to re-add someone already granted (upsert would just no-op it, but
  // hiding it is clearer than a checkbox that silently does nothing).
  const alreadyGrantedTargetIds = useMemo(
    () => new Set(grants.filter((g) => g.granteeId === granteeId).map((g) => g.targetId)),
    [grants, granteeId]
  );

  const grantsByGrantee = useMemo(() => {
    const map = new Map<string, Grant[]>();
    for (const g of grants) {
      const list = map.get(g.granteeId) ?? [];
      list.push(g);
      map.set(g.granteeId, list);
    }
    return map;
  }, [grants]);

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

  function toggleTarget(id: string) {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddGrants(e: React.FormEvent) {
    e.preventDefault();
    setGrantError(null);
    if (!granteeId || selectedTargetIds.size === 0) {
      setGrantError("Pick a grantee and at least one person for them to see.");
      return;
    }
    startGrantSave(async () => {
      const result = await grantDoorKnockVisibility(granteeId, Array.from(selectedTargetIds));
      if (!result.ok) {
        setGrantError(result.error);
        return;
      }
      setGrants((prev) => [...result.grants, ...prev]);
      setSelectedTargetIds(new Set());
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
          Verification radius, door-knock visibility, and the shareable appointment form.
        </p>
      </div>

      <ShareableFormCard />

      <Card className="p-4">
        <h2 className="text-sm font-medium">Door-knock verification radius</h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          A disposition change or note only counts toward a rep&apos;s door
          count if their device location was within this distance of the
          lead&apos;s saved address at the time. The change/note itself always
          saves either way — this only affects whether it&apos;s counted.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="number"
            min={1}
            value={radiusInput}
            onChange={(e) => {
              setRadiusInput(e.target.value);
              setRadiusSaved(false);
            }}
            className="w-24"
          />
          <span className="text-sm text-black/60 dark:text-white/60">feet</span>
          <Button size="sm" onClick={handleSaveRadius} disabled={isSavingRadius}>
            {isSavingRadius ? "Saving…" : "Save"}
          </Button>
          {radiusSaved && <span className="text-sm text-green-700 dark:text-green-500">Saved.</span>}
          {radiusError && <span className="text-sm text-red-600 dark:text-red-400">{radiusError}</span>}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-medium">Door-knock visibility grants</h2>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Give one person visibility into one or more other people&apos;s door
          counts on their dashboard — one-directional, and independent of the
          company-wide leaderboard toggle (Reps → Edit). For example, grant
          Ricky visibility into Ryan, Pete, and Joe&apos;s counts without any
          of them seeing Ricky&apos;s or each other&apos;s.
        </p>

        <form onSubmit={handleAddGrants} className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Select
              value={granteeId}
              onChange={(e) => {
                setGranteeId(e.target.value);
                setSelectedTargetIds(new Set());
              }}
            >
              <option value="">Grantee (who sees)…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
            <span className="text-sm text-black/50 dark:text-white/50">can see:</span>
          </div>

          {granteeId && (
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-black/10 p-2 dark:border-white/10 sm:grid-cols-3">
              {profiles
                .filter((p) => p.id !== granteeId && !alreadyGrantedTargetIds.has(p.id))
                .map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 rounded px-1 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5">
                    <input
                      type="checkbox"
                      checked={selectedTargetIds.has(p.id)}
                      onChange={() => toggleTarget(p.id)}
                    />
                    {p.full_name}
                  </label>
                ))}
              {profiles.filter((p) => p.id !== granteeId && !alreadyGrantedTargetIds.has(p.id)).length === 0 && (
                <p className="col-span-full text-sm italic text-black/40 dark:text-white/40">
                  Already has visibility into everyone else.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary" size="sm" disabled={isSavingGrant || selectedTargetIds.size === 0}>
              {isSavingGrant ? "Adding…" : `Add ${selectedTargetIds.size || ""} Grant${selectedTargetIds.size === 1 ? "" : "s"}`.trim()}
            </Button>
            {grantError && <span className="text-sm text-red-600 dark:text-red-400">{grantError}</span>}
          </div>
        </form>

        <div className="mt-4 space-y-3">
          {grants.length === 0 && (
            <p className="text-sm italic text-black/40 dark:text-white/40">No grants yet.</p>
          )}
          {Array.from(grantsByGrantee.entries()).map(([grantee, granteeGrants]) => (
            <div key={grantee} className="space-y-1">
              <p className="text-sm font-medium">{nameById.get(grantee) ?? "Unknown"} can see:</p>
              <div className="flex flex-wrap gap-1.5">
                {granteeGrants.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/15 py-0.5 pl-2.5 pr-1 text-xs dark:border-white/20"
                  >
                    {nameById.get(g.targetId) ?? "Unknown"}
                    <button
                      type="button"
                      onClick={() => handleRemoveGrant(g.id)}
                      disabled={isSavingGrant}
                      className="rounded-full px-1 text-black/40 hover:bg-black/10 hover:text-black disabled:opacity-50 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
                      title="Remove grant"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// window.location.origin (not a hardcoded domain) so this shows the
// right link whether it's actually the production domain or someone's
// testing it on a preview deployment — same link, no separate config.
function ShareableFormCard() {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/appointment-request` : "";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, non-HTTPS) — the URL is
      // still shown in the field either way, so it's still copyable
      // by hand.
    }
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-medium">Shareable appointment form</h2>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">
        No account needed — for someone (e.g. a designer) who just needs to submit an appointment
        without going through Leads. It comes in unassigned; you&apos;ll see it in Appointments and
        can assign it from there.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Input value={url} readOnly onFocus={(e) => e.target.select()} className="flex-1" />
        <Button size="sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy Link"}
        </Button>
      </div>
    </Card>
  );
}
