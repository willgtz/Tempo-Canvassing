import { SigningClient } from "./signing-client";

// Deliberately standalone — no layout.tsx in this directory, so it only
// ever gets the root layout's bare html/body shell, same as /login and
// /invite. No requireSession anywhere in this tree; the signer's own
// hashed token (verified by the API routes this calls) is the entire
// authorization boundary.
export default async function SignPage({
  params,
  searchParams,
}: {
  params: Promise<{ signerId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { signerId } = await params;
  const { t: token } = await searchParams;

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl bg-white dark:bg-neutral-950">
      <SigningClient signerId={signerId} token={token ?? null} />
    </div>
  );
}
