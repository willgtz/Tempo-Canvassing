import type { HTMLAttributes } from "react";
import { cn } from "./cn";

// Rounded + soft shadow instead of the plain hairline-border boxes used
// everywhere before — closer to the card treatment iOS uses for
// AppointmentRow/StatTile-equivalent surfaces. Border kept (barely
// visible) alongside the shadow since a shadow alone reads poorly against
// a plain white/black page background with no ambient contrast.
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]",
        className
      )}
      {...props}
    />
  );
}
