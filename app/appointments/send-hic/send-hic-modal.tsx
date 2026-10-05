"use client";

import { useSlideIn } from "@/lib/use-slide-in";
import { cn } from "@/components/ui/cn";

// Deliberately its own centered overlay (same chrome as AddLeadModal),
// not another inline section — both the rep and admin appointment
// panels are themselves already full-height slide-in panels (the rep
// panel alone reaches z-40), so a form this long needs clear visual
// separation from "the appointment" rather than just another bordered
// block inside it. z-50/z-[60] sits above every other panel/modal in
// either host (highest existing is the rep panel's z-40), so this
// always reads as the topmost layer regardless of which panel it opened
// from.
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
      <div
        className={cn(
          "fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-black/10 bg-white p-6 shadow-xl transition-all duration-200 ease-out dark:border-white/10 dark:bg-neutral-950",
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-3 dark:border-white/10">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-sm text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </>
  );
}
