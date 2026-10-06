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
    // h-dvh (not min-h-screen) + overflow-hidden caps this to the actual
    // visible viewport on mobile Safari, where the address bar collapsing
    // during scroll would otherwise change 100vh mid-gesture. SigningClient
    // relies on this being a hard ceiling, not a minimum, so only its own
    // document pane scrolls internally — see the comment there.
    <div className="mx-auto h-dvh w-full max-w-2xl overflow-hidden bg-white dark:bg-neutral-950">
      <SigningClient signerId={signerId} token={token ?? null} />
    </div>
  );
}
