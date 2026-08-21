import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "destructive" | "ghost";
type Size = "sm" | "md";

// Capsule shape, solid-fill primary/destructive — matches the iOS app's
// own glass-capsule buttons (LoginScreen's Sign In, LeadsScreen's Route
// pill) more closely than the flat rectangular buttons this app used
// before. Blue as the primary color matches iOS's default system accent
// (this app has no custom AccentColor asset, so that's genuinely what
// reps see on their phones).
// active: states fire on touchstart/mousedown, instantly, with zero JS or
// network round-trip involved — this is what makes a tap feel like it
// registered immediately even before whatever the button triggers
// (navigation, a Server Action) has actually resolved.
// Subtle top-to-bottom gradient + shadow (not flat fills) on the two
// solid-fill variants — small, cheap depth cue that reads as "a real
// pressable button" rather than a flat color rectangle, without going
// anywhere near skeuomorphic. Secondary/ghost stay flat on purpose:
// they're meant to look quieter/lower-emphasis than primary/destructive,
// and a gradient on a bordered-only button doesn't read the same way.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-600/20 hover:from-blue-600 hover:to-blue-700 hover:shadow-md hover:shadow-blue-600/30 active:from-blue-700 active:to-blue-800 dark:from-blue-500 dark:to-blue-600 dark:hover:from-blue-600 dark:hover:to-blue-700",
  secondary:
    "border border-black/15 text-black hover:bg-black/5 active:bg-black/10 dark:border-white/20 dark:text-white dark:hover:bg-white/10 dark:active:bg-white/20",
  destructive:
    "bg-gradient-to-b from-red-500 to-red-600 text-white shadow-sm shadow-red-600/20 hover:from-red-600 hover:to-red-700 hover:shadow-md hover:shadow-red-600/30 active:from-red-700 active:to-red-800 dark:from-red-500 dark:to-red-600 dark:hover:from-red-600 dark:hover:to-red-700",
  ghost: "text-black/70 hover:bg-black/5 active:bg-black/10 dark:text-white/70 dark:hover:bg-white/10 dark:active:bg-white/20",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant = "primary", size = "md", className, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all duration-100 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  );
});
