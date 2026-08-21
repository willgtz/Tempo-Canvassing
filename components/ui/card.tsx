import type { HTMLAttributes } from "react";
import { cn } from "./cn";

// Rounded + soft shadow instead of the plain hairline-border boxes used
// everywhere before — closer to the card treatment iOS uses for
// AppointmentRow/StatTile-equivalent surfaces. Border kept (barely
// visible) alongside the shadow since a shadow alone reads poorly against
// a plain white/black page background with no ambient contrast.
// shadow bumped from -sm to -md/black-5% — the original was so faint it
// read as basically flat next to the plain-bordered boxes still used
// elsewhere; this is still subtle, just more visibly "a raised surface."
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-black/10 bg-white shadow-md shadow-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-black/20",
        className
      )}
      {...props}
    />
  );
}
