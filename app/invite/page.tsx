"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function InvitePage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [namePending, setNamePending] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    async function init() {
      // Supabase's own auth server reports a burned/expired invite token
      // via a #error=...&error_description=... hash fragment on this
      // exact page, regardless of what link format sent them here. Checked
      // first and unconditionally — if this browser also happens to have
      // an unrelated active session (e.g. the admin who sent the invite,
      // testing it while still logged into their own account), that must
      // never be mistaken for a freshly-established invite session, or
      // this silently falls through to "you're signed in, just set a
      // password" for the WRONG account instead of surfacing the real
      // expired-link error.
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const hashError = hashParams.get("error_description") || hashParams.get("error");
      if (hashError) {
        setLinkError(hashError.replace(/\+/g, " "));
        setReady(true);
        return;
      }

      // New-style link (invite-user Edge Function): a token_hash in the
      // query string, exchanged here explicitly rather than relying on
      // detectSessionInUrl's implicit hash-token pickup — see the Edge
      // Function's comment on why the link points here instead of
      // straight at Supabase's own verify endpoint.
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "invite" | "recovery" | "email" | "signup" | "email_change" | "magiclink",
        });
        if (verifyError) {
          setLinkError(verifyError.message);
          setReady(true);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      const session = data.session;
      setHasSession(Boolean(session));
      if (session) {
        // Email-only invites (invite-user Edge Function, used by both the
        // web and iOS admin panels) create the profile row with
        // name_pending: true and a placeholder name — this is what tells
        // us to still ask for a real one here.
        const { data: profile } = await supabase
          .from("profiles")
          .select("name_pending")
          .eq("id", session.user.id)
          .single();
        setNamePending(Boolean(profile?.name_pending));
      }
      setReady(true);
    }

    init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (namePending && !fullName.trim()) {
      setError("Enter your name.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const { data: userData, error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setIsSubmitting(false);
      setError(updateError.message);
      return;
    }

    if (namePending && userData.user) {
      // Self-update — profiles_update_admin's RLS (schema.sql) allows
      // id = auth.uid() on top of the admin path, so this needs no
      // elevated access.
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), name_pending: false })
        .eq("id", userData.user.id);
      if (profileError) {
        setIsSubmitting(false);
        setError(profileError.message);
        return;
      }
    }

    setIsSubmitting(false);
    router.push("/dashboard");
  }

  if (!ready) {
    return null;
  }

  if (!hasSession) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="max-w-sm text-center text-sm text-red-600 dark:text-red-400">
          {linkError && !linkError.toLowerCase().includes("expired") && !linkError.toLowerCase().includes("invalid")
            ? linkError
            : "This invite link is invalid or has expired."}{" "}
          Ask your admin to resend it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 p-6 dark:border-white/10"
      >
        <div>
          <h1 className="text-lg font-semibold">
            {namePending ? "Welcome — let's finish setting up" : "Set your password"}
          </h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            {namePending
              ? "Tell us your name and choose a password."
              : "Choose a password to finish setting up your account."}
          </p>
        </div>

        {namePending && (
          <div className="space-y-1">
            <label htmlFor="fullName" className="text-sm font-medium">
              Your name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              className="w-full rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
            />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {isSubmitting ? "Saving…" : "Set Password & Continue"}
        </button>
      </form>
    </div>
  );
}
