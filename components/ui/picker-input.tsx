"use client";

import {
  forwardRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { useDuoScreen } from "@/lib/use-duo-screen";
import {
  formatPickerValue,
  isDayAllowed,
  isoDate,
  monthGrid,
  parsePickerValue,
  type PickerParts,
} from "@/lib/date-picker-value";
import { cn } from "./cn";

// A date or datetime-local input. Everywhere except the iPhone Duo's sideways
// inner screen this is the plain native input. There, iOS's native picker
// closes as soon as it opens, so this shows a calendar the app controls itself.
export const PickerInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PickerInput(props, ref) {
    const isDuo = useDuoScreen();
    if (!isDuo) return <input ref={ref} {...props} />;
    return <DuoPicker {...props} />;
  }
);

const DISPLAY_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

function displayValue(value: string, withTime: boolean): string {
  const { date, hour12, minute, period } = parsePickerValue(value);
  if (!date) return withTime ? "Select date & time" : "Select date";
  const [year, month, day] = date.split("-").map(Number);
  const dateText = new Date(year, month - 1, day).toLocaleDateString(undefined, DISPLAY_DATE);
  return withTime ? `${dateText}, ${hour12}:${String(minute).padStart(2, "0")} ${period}` : dateText;
}

function DuoPicker({ type, value, onChange, required, disabled, min, max, className }: InputHTMLAttributes<HTMLInputElement>) {
  const [isOpen, setIsOpen] = useState(false);
  const withTime = type === "datetime-local";
  const current = typeof value === "string" ? value : "";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        className={cn(className, "text-left disabled:opacity-50")}
      >
        {displayValue(current, withTime)}
      </button>
      {/* Keeps browser "required" validation working on enclosing forms. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={current}
          onChange={() => {}}
          className="sr-only"
        />
      )}
      {isOpen &&
        createPortal(
          <DuoPickerDialog
            initialValue={current}
            withTime={withTime}
            required={required}
            min={typeof min === "string" ? min : undefined}
            max={typeof max === "string" ? max : undefined}
            onCancel={() => setIsOpen(false)}
            onConfirm={(next) => {
              setIsOpen(false);
              // Callers only read e.target.value, the same as with the native input.
              onChange?.({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLInputElement>);
            }}
          />,
          document.body
        )}
    </>
  );
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const CHOICE_BASE = "flex h-9 items-center justify-center rounded-lg text-sm font-medium";
const CHOICE_ON = "bg-blue-600 text-white dark:bg-blue-500";
const CHOICE_OFF = "active:bg-black/10 dark:active:bg-white/20";

function DuoPickerDialog({
  initialValue,
  withTime,
  required,
  min,
  max,
  onCancel,
  onConfirm,
}: {
  initialValue: string;
  withTime: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [parts, setParts] = useState<PickerParts>(() => parsePickerValue(initialValue));
  const [shownMonth, setShownMonth] = useState(() => {
    const start = parts.date ? new Date(`${parts.date}T12:00`) : new Date();
    return { year: start.getFullYear(), month: start.getMonth() };
  });

  const update = (change: Partial<PickerParts>) => setParts((prev) => ({ ...prev, ...change }));
  const moveMonth = (delta: number) => {
    const next = new Date(shownMonth.year, shownMonth.month + delta, 1);
    setShownMonth({ year: next.getFullYear(), month: next.getMonth() });
  };
  const monthLabel = new Date(shownMonth.year, shownMonth.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const now = new Date();
  const today = isoDate(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    // The dialog is portaled, but React still bubbles its clicks to whatever
    // rendered it, such as a clickable table row, so they stop here.
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-2"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 text-black shadow-xl dark:bg-neutral-900 dark:text-white">
        <div className={cn("grid gap-6", withTime ? "grid-cols-2" : "mx-auto max-w-sm grid-cols-1")}>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <button type="button" aria-label="Previous month" onClick={() => moveMonth(-1)} className={cn(CHOICE_BASE, CHOICE_OFF, "w-9 text-lg")}>
                ‹
              </button>
              <span className="text-sm font-semibold">{monthLabel}</span>
              <button type="button" aria-label="Next month" onClick={() => moveMonth(1)} className={cn(CHOICE_BASE, CHOICE_OFF, "w-9 text-lg")}>
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-black/50 dark:text-white/50">
              {WEEKDAYS.map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthGrid(shownMonth.year, shownMonth.month)
                .flat()
                .map((day, index) =>
                  day ? (
                    <button
                      key={day}
                      type="button"
                      disabled={!isDayAllowed(day, min, max)}
                      aria-pressed={parts.date === day}
                      onClick={() => update({ date: day })}
                      className={cn(
                        CHOICE_BASE,
                        parts.date === day ? CHOICE_ON : CHOICE_OFF,
                        day === today && parts.date !== day && "text-blue-600 dark:text-blue-400",
                        "disabled:opacity-30"
                      )}
                    >
                      {Number(day.slice(8))}
                    </button>
                  ) : (
                    <span key={`blank-${index}`} />
                  )
                )}
            </div>
          </div>

          {withTime && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">Time</span>
                <div className="flex overflow-hidden rounded-full border border-black/15 dark:border-white/20">
                  {(["AM", "PM"] as const).map((period) => (
                    <button
                      key={period}
                      type="button"
                      aria-pressed={parts.period === period}
                      onClick={() => update({ period })}
                      className={cn("h-9 px-4 text-sm font-medium", parts.period === period ? CHOICE_ON : CHOICE_OFF)}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-black/50 dark:text-white/50">Hour</p>
              <div className="grid grid-cols-6 gap-1">
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    aria-pressed={parts.hour12 === hour}
                    onClick={() => update({ hour12: hour })}
                    className={cn(CHOICE_BASE, parts.hour12 === hour ? CHOICE_ON : CHOICE_OFF)}
                  >
                    {hour}
                  </button>
                ))}
              </div>
              <p className="text-xs text-black/50 dark:text-white/50">Minute</p>
              <div className="grid grid-cols-6 gap-1">
                {MINUTES.map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    aria-pressed={parts.minute === minute}
                    onClick={() => update({ minute })}
                    className={cn(CHOICE_BASE, parts.minute === minute ? CHOICE_ON : CHOICE_OFF)}
                  >
                    {String(minute).padStart(2, "0")}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-black/50 dark:text-white/50">Fine adjust</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="One minute earlier"
                    onClick={() => update({ minute: (parts.minute + 59) % 60 })}
                    className={cn(CHOICE_BASE, CHOICE_OFF, "w-9 border border-black/15 dark:border-white/20")}
                  >
                    −
                  </button>
                  <span className="w-20 text-center text-sm font-semibold tabular-nums">
                    {parts.hour12}:{String(parts.minute).padStart(2, "0")} {parts.period}
                  </span>
                  <button
                    type="button"
                    aria-label="One minute later"
                    onClick={() => update({ minute: (parts.minute + 1) % 60 })}
                    className={cn(CHOICE_BASE, CHOICE_OFF, "w-9 border border-black/15 dark:border-white/20")}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-black/10 pt-3 dark:border-white/10">
          {!required && (
            <button type="button" onClick={() => onConfirm("")} className="mr-auto h-9 px-3 text-sm font-medium text-black/60 dark:text-white/60">
              Clear
            </button>
          )}
          <button type="button" onClick={onCancel} className="h-9 rounded-lg border border-black/15 px-4 text-sm font-medium dark:border-white/20">
            Cancel
          </button>
          <button
            type="button"
            disabled={!parts.date}
            onClick={() => onConfirm(formatPickerValue(parts, withTime))}
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-blue-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
