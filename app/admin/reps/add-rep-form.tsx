"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addRep, inviteRep } from "./actions";

type ManagerOption = { id: string; full_name: string; role: string };
type Mode = "password" | "invite";

export function AddRepForm({ managerOptions }: { managerOptions: ManagerOption[] }) {
  const [mode, setMode] = useState<Mode>("password");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [managerId, setManagerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result =
        mode === "password"
          ? await addRep({
              fullName,
              email,
              phone: phone || null,
              password,
              managerId: managerId || null,
            })
          : await inviteRep({ email });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setManagerId("");
      setSuccess(
        mode === "password"
          ? "Rep created — they can log in now."
          : "Invite sent — they'll set their own password by email."
      );
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10"
    >
      <div className="flex overflow-hidden rounded border border-black/15 text-sm dark:border-white/20 w-fit">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={`px-3 py-1 ${mode === "password" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
        >
          Set password now
        </button>
        <button
          type="button"
          onClick={() => setMode("invite")}
          className={`px-3 py-1 ${mode === "invite" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
        >
          Send email invite
        </button>
      </div>
      {mode === "invite" && (
        <p className="text-xs text-black/50 dark:text-white/50">
          They&apos;ll get a Fenix-branded email and choose their own name and
          password — same flow as inviting from the iOS app. You can set
          phone/manager afterward from the Manage page.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "password" && (
          <div className="space-y-1">
            <label className="text-xs font-medium">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
        )}
        <div className="space-y-1">
          <label className="text-xs font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>
        {mode === "password" && (
          <>
            <div className="space-y-1">
              <label className="text-xs font-medium">Phone (optional)</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Initial password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-medium">Reports to (optional)</label>
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full rounded border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
              >
                <option value="">No manager</option>
                {managerOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.role})
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {isPending ? "Saving…" : mode === "password" ? "Add Rep" : "Send Invite"}
        </button>
        {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        {success && <span className="text-sm text-green-600 dark:text-green-400">{success}</span>}
      </div>
    </form>
  );
}
