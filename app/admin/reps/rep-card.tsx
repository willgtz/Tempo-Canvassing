"use client";

import { useState, useTransition } from "react";
import {
  assignZip,
  unassignZip,
  assignAllZips,
  updateUser,
  sendPasswordReset,
  setUserPassword,
  inviteRep,
  cancelInvite,
  type UserRole,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ManagedUser = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  manager_id: string | null;
  can_view_company_leaderboard: boolean;
  excluded_from_leaderboard: boolean;
  // Set by the invite-user Edge Function on an email-only invite (iOS
  // admin panel) — full_name is a placeholder (the email's local part)
  // until the invited user actually signs in and sets their own name.
  // Never true for admin-created (addRep) or web-invited (inviteRep)
  // accounts, which always collect a real name upfront.
  name_pending: boolean;
};

type ManagerOption = { id: string; full_name: string; role: string };
type Assignment = { id: string; zipcode: string };
type ZipHistoryEntry = {
  id: string;
  zipcode: string;
  assignedAt: string;
  assignedByName: string | null;
  unassignedAt: string | null;
  unassignedByName: string | null;
};

const ROLE_OPTIONS: UserRole[] = ["rep", "team_lead", "admin", "super_admin"];

export function RepCard({
  user,
  managerOptions,
  isSelf,
  managerName,
  initialAssignments,
  zipHistory,
}: {
  user: ManagedUser;
  managerOptions: ManagerOption[];
  isSelf: boolean;
  managerName: string | null;
  initialAssignments: Assignment[];
  zipHistory: ZipHistoryEntry[];
}) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState<UserRole>(user.role);
  const [active, setActive] = useState(user.active);
  const [managerId, setManagerId] = useState(user.manager_id ?? "");
  const [canViewCompanyLeaderboard, setCanViewCompanyLeaderboard] = useState(
    user.can_view_company_leaderboard
  );
  const [excludedFromLeaderboard, setExcludedFromLeaderboard] = useState(
    user.excluded_from_leaderboard
  );
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, startProfileSave] = useTransition();

  const [assignments, setAssignments] = useState(initialAssignments);
  const [zipInput, setZipInput] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [isSavingZip, startZipSave] = useTransition();

  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [isSendingReset, startResetSend] = useTransition();

  function handleSendReset() {
    setResetMessage(null);
    startResetSend(async () => {
      const result = await sendPasswordReset(user.email);
      setResetMessage(result.ok ? `Reset email sent to ${user.email}.` : result.error);
    });
  }

  // inviteRep is idempotent for still-pending accounts (invite-user Edge
  // Function skips the "already exists" rejection when name_pending is
  // true) — calling it again for the same email just regenerates a fresh
  // token and re-sends the branded email, exactly what "resend in case
  // the email was wrong/never arrived" needs, with no separate action.
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [isResending, startResend] = useTransition();

  function handleResendInvite() {
    setResendMessage(null);
    startResend(async () => {
      const result = await inviteRep({ email: user.email });
      setResendMessage(result.ok ? `Invite re-sent to ${user.email}.` : result.error);
    });
  }

  const [isCanceling, startCancel] = useTransition();

  function handleCancelInvite() {
    if (!confirm(`Cancel the invite to ${user.email}? This deletes the pending account entirely — you'll be able to invite this email fresh afterward.`)) {
      return;
    }
    startCancel(async () => {
      const result = await cancelInvite(user.id);
      if (!result.ok) {
        setResendMessage(result.error);
      }
      // On success the row disappears via revalidatePath — no local state
      // to reset.
    });
  }

  // Separate from handleSendReset — that one emails the user a link they
  // complete themselves; this sets a password directly and immediately
  // (e.g. for handing someone their login on the spot, or an Apple review
  // test account where an email round-trip isn't practical).
  const [showManualPassword, setShowManualPassword] = useState(false);
  const [manualPassword, setManualPassword] = useState("");
  const [manualPasswordMessage, setManualPasswordMessage] = useState<string | null>(null);
  const [isSettingPassword, startSetPassword] = useTransition();

  function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    setManualPasswordMessage(null);
    startSetPassword(async () => {
      const result = await setUserPassword(user.id, manualPassword);
      if (!result.ok) {
        setManualPasswordMessage(result.error);
        return;
      }
      setManualPasswordMessage("Password updated.");
      setManualPassword("");
    });
  }

  function handleCancel() {
    setFullName(user.full_name);
    setEmail(user.email);
    setPhone(user.phone ?? "");
    setRole(user.role);
    setActive(user.active);
    setManagerId(user.manager_id ?? "");
    setCanViewCompanyLeaderboard(user.can_view_company_leaderboard);
    setExcludedFromLeaderboard(user.excluded_from_leaderboard);
    setProfileError(null);
    setEditing(false);
  }

  function handleSaveProfile() {
    setProfileError(null);
    startProfileSave(async () => {
      const result = await updateUser(user.id, {
        fullName,
        email,
        phone: phone || null,
        role,
        active,
        managerId: managerId || null,
        canViewCompanyLeaderboard,
        excludedFromLeaderboard,
      });
      if (!result.ok) {
        setProfileError(result.error);
        return;
      }
      setEditing(false);
    });
  }

  function handleAssignZip(e: React.FormEvent) {
    e.preventDefault();
    setZipError(null);
    const zip = zipInput.trim();
    startZipSave(async () => {
      const result = await assignZip(user.id, zip);
      if (!result.ok) {
        setZipError(result.error);
        return;
      }
      setAssignments((prev) => [...prev, result.assignment]);
      setZipInput("");
    });
  }

  function handleRemoveZip(assignmentId: string) {
    setZipError(null);
    startZipSave(async () => {
      const result = await unassignZip(assignmentId);
      if (!result.ok) {
        setZipError(result.error);
        return;
      }
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    });
  }

  function handleAssignAllZips() {
    if (!confirm(`Assign every zip that currently has leads to ${user.full_name}? This only covers zips that exist right now — a zip added later needs this run again.`)) {
      return;
    }
    setZipError(null);
    startZipSave(async () => {
      const result = await assignAllZips(user.id);
      if (!result.ok) {
        setZipError(result.error);
        return;
      }
      setAssignments(result.assignments);
    });
  }

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      {editing ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Phone (optional)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Reports to</label>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              >
                <option value="">No manager</option>
                {managerOptions
                  .filter((m) => m.id !== user.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.role})
                    </option>
                  ))}
              </select>
            </div>
            <label className="flex items-center gap-1.5 self-end pb-1.5 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active
            </label>
          </div>

          <div className="space-y-1 border-t border-black/10 pt-3 dark:border-white/10">
            <p className="text-xs font-medium">Door-knock leaderboard</p>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={canViewCompanyLeaderboard}
                onChange={(e) => setCanViewCompanyLeaderboard(e.target.checked)}
              />
              Can view company-wide door-knock leaderboard
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={excludedFromLeaderboard}
                onChange={(e) => setExcludedFromLeaderboard(e.target.checked)}
              />
              Excluded from other people&apos;s leaderboard view
            </label>
            <p className="text-xs text-black/50 dark:text-white/50">
              To let a specific user see specific other users&apos; door counts
              (without the full company leaderboard), use Settings →
              Door-Knock Visibility.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCancel}
              disabled={isSavingProfile}
              className="rounded border border-black/15 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="rounded bg-black px-3 py-1 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {isSavingProfile ? "Saving…" : "Save"}
            </button>
            {profileError && (
              <span className="text-sm text-red-600 dark:text-red-400">{profileError}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <p className="flex flex-wrap items-center gap-1.5 font-medium">
              {user.name_pending ? (
                <span className="italic text-black/50 dark:text-white/50">Invited, not yet set up</span>
              ) : (
                user.full_name
              )}
              <span className="text-xs font-normal text-black/50 dark:text-white/50">
                ({user.role}
                {!user.active ? ", inactive" : ""}
                {isSelf ? ", you" : ""})
              </span>
              {user.name_pending && <Badge className="border-amber-500/40 text-amber-700 dark:text-amber-400">Pending Invite</Badge>}
            </p>
            <p className="text-sm text-black/60 dark:text-white/60">{user.email}</p>
            {user.phone && (
              <p className="text-sm text-black/60 dark:text-white/60">{user.phone}</p>
            )}
            <p className="text-xs text-black/50 dark:text-white/50">
              Reports to: {managerName ?? "—"}
            </p>
          </div>
          {isSelf ? (
            <span className="shrink-0 text-xs text-black/40 dark:text-white/40">
              Can&apos;t edit your own account
            </span>
          ) : (
            <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
              <div className="flex flex-wrap gap-2">
                {user.name_pending && (
                  <>
                    <Button variant="secondary" size="sm" onClick={handleResendInvite} disabled={isResending}>
                      {isResending ? "Sending…" : "Resend Invite"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={handleCancelInvite} disabled={isCanceling}>
                      {isCanceling ? "Canceling…" : "Cancel Invite"}
                    </Button>
                  </>
                )}
                <Button variant="secondary" size="sm" onClick={handleSendReset} disabled={isSendingReset}>
                  {isSendingReset ? "Sending…" : "Email Reset Link"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowManualPassword((v) => !v);
                    setManualPasswordMessage(null);
                  }}
                >
                  Set Password
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </div>
              {resendMessage && (
                <span className="text-xs text-black/50 sm:max-w-[220px] sm:text-right dark:text-white/50">
                  {resendMessage}
                </span>
              )}
              {resetMessage && (
                <span className="text-xs text-black/50 sm:max-w-[220px] sm:text-right dark:text-white/50">
                  {resetMessage}
                </span>
              )}
              {showManualPassword && (
                <form onSubmit={handleSetPassword} className="mt-1 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                  <Input
                    type="password"
                    value={manualPassword}
                    onChange={(e) => setManualPassword(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    minLength={8}
                    required
                    className="w-full sm:w-44"
                  />
                  <Button type="submit" size="sm" disabled={isSettingPassword}>
                    {isSettingPassword ? "Saving…" : "Save"}
                  </Button>
                </form>
              )}
              {manualPasswordMessage && (
                <span className="text-xs text-black/50 sm:max-w-[220px] sm:text-right dark:text-white/50">
                  {manualPasswordMessage}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {assignments.length === 0 && (
          <span className="text-sm italic text-black/40 dark:text-white/40">
            No active zip assignments
          </span>
        )}
        {assignments.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={isSavingZip}
            onClick={() => handleRemoveZip(a.id)}
            className="rounded-full border border-black/15 px-3 py-1 text-xs disabled:opacity-50 dark:border-white/20"
            title="Remove assignment"
          >
            {a.zipcode} ×
          </button>
        ))}
      </div>

      <form onSubmit={handleAssignZip} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={zipInput}
          onChange={(e) => setZipInput(e.target.value)}
          placeholder="Zip code"
          inputMode="numeric"
          pattern="\d{5}"
          maxLength={5}
          required
          className="w-28 rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
        />
        <button
          type="submit"
          disabled={isSavingZip}
          className="rounded border border-black/15 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20"
        >
          Assign
        </button>
        <button
          type="button"
          onClick={handleAssignAllZips}
          disabled={isSavingZip}
          className="rounded border border-black/15 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20"
        >
          Assign All Zips
        </button>
        {zipError && <span className="text-xs text-red-600 dark:text-red-400">{zipError}</span>}
      </form>

      {zipHistory.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            {showHistory ? "Hide" : "Show"} zip history ({zipHistory.length})
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1 border-t border-black/10 pt-2 text-xs text-black/60 dark:border-white/10 dark:text-white/60">
              {zipHistory.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{h.zipcode}</span> — assigned{" "}
                  {new Date(h.assignedAt).toLocaleDateString()}
                  {h.assignedByName ? ` by ${h.assignedByName}` : ""}
                  {h.unassignedAt ? (
                    <>
                      {" "}
                      → removed {new Date(h.unassignedAt).toLocaleDateString()}
                      {h.unassignedByName ? ` by ${h.unassignedByName}` : ""}
                    </>
                  ) : (
                    <span className="text-green-700 dark:text-green-500"> — currently active</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
