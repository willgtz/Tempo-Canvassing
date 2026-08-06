"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Separate from /invite, not shared — /invite's "finish setting up your
// account" copy reads wrong for an existing user, and /invite also
// conditionally shows a name field (name_pending flow) that has no
// business appearing here. Reached via resetPasswordForEmail's
// redirectTo, both from an admin resetting someone else's password
// (AdminUserDetailScreen.swift, rep-card.tsx) and a rep's own "forgot
// password" (iOS login screen) — same recovery-link mechanism either way.
export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(Boolean(data.session));
      setReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/dashboard");
  }

  if (!ready) {
    return null;
  }

  if (!hasSession) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <p className="max-w-sm text-center text-sm text-red-600 dark:text-red-400">
          This reset link is invalid or has expired. Request a new one from
          your admin, or use &quot;Forgot password?&quot; again.
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
          <h1 className="text-lg font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Choose a new password for your account.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            New password
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
            Confirm new password
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
          {isSubmitting ? "Saving…" : "Reset Password"}
        </button>
      </form>
    </div>
  );
}
