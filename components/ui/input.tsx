import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "./cn";

// text-base (16px) below md, text-sm (14px) at md and up — iOS Safari
// auto-zooms the whole page when focusing any input under 16px, which is
// jarring on mobile. Desktop doesn't have that quirk, so it can stay at
// the more compact size already used throughout the admin UI.
const FIELD_CLASSES =
  "rounded-lg border border-black/15 bg-white px-3 py-1.5 text-base md:text-sm text-black placeholder:text-black/40 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-white/20 dark:bg-white/[0.03] dark:text-white dark:placeholder:text-white/40";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(FIELD_CLASSES, className)} {...props} />;
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(FIELD_CLASSES, className)} {...props} />;
  }
);
