import { cn } from "./cn";

// Pulsing placeholder block — used by every route's loading.tsx so a nav
// click shows *something* changing immediately (Next.js swaps this in the
// instant navigation starts, before the destination page's server-side
// data fetch even begins), instead of the screen just sitting frozen
// until the whole request round-trips. That frozen-screen gap is what
// was actually causing clicks to feel like they hadn't registered.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-black/10 dark:bg-white/10", className)} />;
}
