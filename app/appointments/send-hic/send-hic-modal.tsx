"use client";

import { useSlideIn } from "@/lib/use-slide-in";
import { cn } from "@/components/ui/cn";

// Deliberately its own overlay (same general idea as AddLeadModal), not
// another inline section — both the rep and admin appointment panels
// are themselves already full-height slide-in panels (the rep panel
// alone reaches z-40), so a form this long needs clear visual
// separation from "the appointment" rather than just another bordered
// block inside it. z-50/z-[60] sits above every other panel/modal in
// either host (highest existing is the rep panel's z-40), so this
// always reads as the topmost layer regardless of which panel it opened
// from.
//
// Bottom sheet on mobile, not centered-via-transform — the same pattern
// RepAppointmentDetail's own outer panel already uses. Centering a tall
// box with top-1/2 + -translate-y-1/2 pushes its top edge above y=0 the
// moment its content is taller than half the viewport (every field in
// this form, easily, especially once the keyboard is open), making the
// header/Cancel button scroll out of reach above the top of the screen.
// Anchoring to inset-x-0 bottom-0 instead means the sheet can only ever
// grow upward from a fixed bottom edge, so the header always stays in
// view. Only switches to a centered floating card from sm: up, where
// there's enough height for centering to not be an issue.
export function SendHicModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const visible = useSlideIn();

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 backdrop-blur-md transition-opacity duration-200",
          visible ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      {/* flex-col + overflow-hidden on the outer box, with the header as
          a shrink-0 item and only the body scrolling — keeps the
          title/Cancel row permanently visible (not just scrolled past)
          regardless of how long the form content gets, instead of
          relying on sticky positioning inside a scrolling ancestor. */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-[60] flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-black/10 bg-white shadow-xl transition-all duration-200 ease-out dark:border-white/10 dark:bg-neutral-950 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-lg sm:border",
          visible
            ? "translate-y-0 opacity-100 sm:-translate-y-1/2 sm:scale-100 sm:opacity-100"
            : "translate-y-full opacity-0 sm:-translate-y-1/2 sm:scale-95 sm:opacity-0"
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-black/10 p-5 pb-3 dark:border-white/10 sm:p-6 sm:pb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-sm font-medium text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Cancel
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-4 sm:p-6 sm:pt-4">{children}</div>
      </div>
    </>
  );
}
