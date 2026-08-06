import type { HTMLAttributes } from "react";
import { cn } from "./cn";

// Colored dot + label pill — the pattern already used ad hoc for
// disposition/status colors across leads-list.tsx, appointments-
// explorer.tsx, etc. This just gives that pattern one shared
// implementation instead of each page re-writing the same markup.
export function Badge({
  color,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-black/10 px-2.5 py-0.5 text-xs font-medium dark:border-white/15",
        className
      )}
      {...props}
    >
      {color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </span>
  );
}
