"use client";

import { useActionState, useState } from "react";
import { login } from "./actions";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  return (
    // Soft accent-tinted gradient over the page background, top to bottom —
    // matches LoginScreen.swift's LinearGradient(accentColor 45% -> 8%)
    // behind the iOS glass fields, the web equivalent of "glass over
    // something" since there's no native glassEffect on the web.
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-blue-600/40 to-blue-600/5 px-6 dark:from-blue-500/30 dark:to-blue-500/5">
      <form action={formAction} className="w-full max-w-sm space-y-3">
        <div className="mb-2 space-y-1 text-center">
          <h1 className="text-4xl font-bold">Fenix</h1>
          <p className="text-sm text-black/60 dark:text-white/60">Sign in to your account</p>
        </div>

        <input
          id="email"
          name="email"
          type="email"
          placeholder="Email"
          required
          autoComplete="email"
          className="w-full rounded-full border border-black/10 bg-white/70 px-5 py-3.5 text-base text-black placeholder:text-black/40 backdrop-blur-md focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/15 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40"
        />

        <input
          id="password"
          name="password"
          type="password"
          placeholder="Password"
          required
          autoComplete="current-password"
          className="w-full rounded-full border border-black/10 bg-white/70 px-5 py-3.5 text-base text-black placeholder:text-black/40 backdrop-blur-md focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/15 dark:bg-white/10 dark:text-white dark:placeholder:text-white/40"
        />

        {state?.error && (
          <p role="alert" className="text-center text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-blue-600 px-5 py-3.5 text-base font-semibold text-white transition-opacity disabled:opacity-50 dark:bg-blue-500"
        >
          {pending ? "Signing in…" : "Sign In"}
        </button>

        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => setShowForgotPassword(true)}
            className="text-sm text-black/60 hover:underline dark:text-white/60"
          >
            Forgot password?
          </button>
        </div>
      </form>

      {showForgotPassword && (
        <ForgotPasswordDialog onClose={() => setShowForgotPassword(false)} />
      )}
    </div>
  );
}

function ForgotPasswordDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setIsSending(true);
    setMessage(null);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // Same enumeration-safe wording regardless of outcome — resetPasswordForEmail
    // always "succeeds" so it can't be used to check which emails have accounts.
    setMessage("If that email has an account, a reset link is on its way.");
    setIsSending(false);
  }

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/40 backdrop-blur-md" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-30 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-black/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-neutral-950">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">Reset Password</h2>
          <button
            onClick={onClose}
            className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Close
          </button>
        </div>
        <form onSubmit={handleSend} className="mt-4 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoFocus
            className="w-full rounded-lg border border-black/15 px-3 py-1.5 text-base text-black placeholder:text-black/40 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/20 dark:bg-transparent dark:text-white dark:placeholder:text-white/40"
          />
          <p className="text-xs text-black/50 dark:text-white/50">
            We&apos;ll email you a link to reset your password.
          </p>
          {message && <p className="text-sm text-black/70 dark:text-white/70">{message}</p>}
          <button
            type="submit"
            disabled={!email.trim() || isSending}
            className="w-full rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-blue-500"
          >
            {isSending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>
    </>
  );
}
