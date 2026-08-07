export const metadata = {
  title: "Support — Fenix Canvassing",
};

// App Store Connect requires a Support URL for every app listing —
// this is that page. Kept intentionally simple: this is an internal
// tool with no public user base to self-serve, so "support" mostly
// means "how staff reach an admin," not a help center.
export default function SupportPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6 text-sm leading-relaxed">
      <div>
        <h1 className="text-xl font-semibold">Support</h1>
        <p className="mt-1 text-black/60 dark:text-white/60">Fenix Canvassing</p>
      </div>

      <p>
        Fenix Canvassing is an internal tool for Tempo Solar employees and contractors. If
        you&apos;re having trouble signing in, using a feature, or think something isn&apos;t
        working correctly, contact us at{" "}
        <a href="mailto:fenix@temposolarvegas.com" className="underline">
          fenix@temposolarvegas.com
        </a>
        .
      </p>

      <p>
        Accounts are created by an administrator — if you were expecting an invite and haven&apos;t
        received one, or need your password reset, reach out to your admin or use the address
        above.
      </p>

      <p>
        See our{" "}
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>{" "}
        for information about what data the app collects and how it&apos;s used.
      </p>
    </div>
  );
}
