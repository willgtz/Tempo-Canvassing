"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Phase = "checking" | "confirm" | "verifying" | "form" | "error";

export default function InvitePage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const [otpType, setOtpType] = useState<string | null>(null);
  const [namePending, setNamePending] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  // Purely reads the URL — never calls verifyOtp itself, so this is safe
  // to run even if an email security scanner or a mail client's link
  // preview loads this page automatically before the real recipient
  // clicks. Consuming the one-time token is gated behind an explicit
  // button click instead (handleConfirm below) — even the first fix
  // here (pointing the link at our own page instead of Supabase's
  // verify endpoint) turned out not to be enough on its own, since some
  // scanners/previews execute a page's JS too, not just a bare GET. A
  // simulated click after page load is a much higher bar those don't
  // clear.
  useEffect(() => {
    async function init() {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const hashError = hashParams.get("error_description") || hashParams.get("error");
      if (hashError) {
        setLinkError(hashError.replace(/\+/g, " "));
        setPhase("error");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const th = params.get("token_hash");
      const type = params.get("type");
      if (th && type) {
        setTokenHash(th);
        setOtpType(type);
        setPhase("confirm");
        return;
      }

      await checkExistingSession();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkExistingSession() {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setLinkError(null);
      setPhase("error");
      return;
    }
    await loadProfileAndShowForm(data.session.user.id);
  }

  async function loadProfileAndShowForm(userId: string) {
    const supabase = createClient();
    // Email-only invites (invite-user Edge Function, used by both the web
    // and iOS admin panels) create the profile row with name_pending: true
    // and a placeholder name — this is what tells us to still ask for a
    // real one here.
    const { data: profile } = await supabase
      .from("profiles")
      .select("name_pending")
      .eq("id", userId)
      .single();
    setNamePending(Boolean(profile?.name_pending));
    setPhase("form");
  }

  // Only ever called from the Continue button's onClick — never
  // automatically on page load. This is the actual defense: an automated
  // scanner or preview can fetch and even render this page, but it isn't
  // simulating a real person clicking a button, so it can't burn the
  // token before the recipient does.
  async function handleConfirm() {
    if (!tokenHash || !otpType) return;
    setPhase("verifying");
    const supabase = createClient();
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType as "invite" | "recovery" | "email" | "signup" | "email_change" | "magiclink",
    });
    if (verifyError || !data.user) {
      setLinkError(verifyError?.message ?? null);
      setPhase("error");
      return;
    }
    await loadProfileAndShowForm(data.user.id);
  }

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

  if (phase === "checking" || phase === "verifying") {
    return null;
  }

  if (phase === "error") {
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

  if (phase === "confirm") {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 p-6 text-center dark:border-white/10">
          <h1 className="text-lg font-semibold">You&apos;re invited to Fenix</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Click below to continue setting up your account.
          </p>
          <button
            onClick={handleConfirm}
            className="w-full rounded bg-black px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Continue
          </button>
        </div>
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
