import type { HTMLAttributes } from "react";
import { cn } from "./cn";

// Colored dot + label pill — the pattern already used ad hoc for
// disposition/status colors across leads-list.tsx, appointments-
// explorer.tsx, etc. This just gives that pattern one shared
// implementation instead of each page re-writing the same markup.
//
// When a color is given, it now also tints the badge's own background/
// border (via color-mix, so no per-color JS/hex-to-rgba conversion is
// needed) instead of being carried by the dot alone — the dot was easy
// to miss at a glance since the rest of the pill looked identical
// regardless of disposition/status.
export function Badge({
  color,
  className,
  children,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        color ? "" : "border-black/10 dark:border-white/15",
        className
      )}
      style={
        color
          ? {
              backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)`,
              borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
              ...style,
            }
          : style
      }
      {...props}
    >
      {color && <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </span>
  );
}
