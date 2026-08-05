// Applies to this route's Server Actions too (Next.js reads maxDuration for
// Server Actions from the page they're invoked on, not the action file).
// Background geocoding runs via `after()` after commitLeadBatch responds,
// so it needs headroom beyond a typical request.
export const maxDuration = 60;

export default function UploadLeadsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
