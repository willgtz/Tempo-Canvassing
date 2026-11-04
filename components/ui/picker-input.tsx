"use client";

import {
  forwardRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { useDuoScreen } from "@/lib/use-duo-screen";
import { cn } from "./cn";

// A date or datetime-local input. On the iPhone Duo's sideways inner screen,
// the time wheel inside iOS's combined date-and-time picker closes as soon as it
// opens, while a separate time input stays open (checked on a real Duo). So a
// datetime-local input becomes separate native date and time inputs there, and
// everything else is the plain native input.
export const PickerInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function PickerInput(props, ref) {
    const isDuo = useDuoScreen();
    if (!isDuo || props.type !== "datetime-local") return <input ref={ref} {...props} />;
    return <SplitDateTimeInputs {...props} />;
  }
);

function SplitDateTimeInputs({ value, onChange, required, disabled, min, max, className }: InputHTMLAttributes<HTMLInputElement>) {
  const current = typeof value === "string" ? value.slice(0, 16) : "";
  const [date, setDate] = useState(current.slice(0, 10));
  const [time, setTime] = useState(current.slice(11, 16));

  // The caller's value is empty until both parts are filled in, so one part can
  // be chosen first without losing it. Any other difference means the caller
  // changed the value, and that takes over.
  const combined = date && time ? `${date}T${time}` : "";
  if (current !== combined) {
    setDate(current.slice(0, 10));
    setTime(current.slice(11, 16));
  }

  function update(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    const next = nextDate && nextTime ? `${nextDate}T${nextTime}` : "";
    // Callers only read e.target.value, the same as with the native input.
    onChange?.({ target: { value: next }, currentTarget: { value: next } } as ChangeEvent<HTMLInputElement>);
  }

  // The 9rem basis stacks the fields in a narrow form column, where side by side
  // would cut off the date.
  const fieldClass = cn(className, "min-w-0 flex-[1_1_9rem]");

  return (
    <div className="flex min-w-0 flex-1 basis-full flex-wrap gap-2">
      <input
        type="date"
        aria-label="Date"
        value={date}
        required={required}
        disabled={disabled}
        min={typeof min === "string" ? min.slice(0, 10) : undefined}
        max={typeof max === "string" ? max.slice(0, 10) : undefined}
        onChange={(e) => update(e.target.value, time)}
        className={fieldClass}
      />
      <input
        type="time"
        aria-label="Time"
        value={time}
        required={required}
        disabled={disabled}
        onChange={(e) => update(date, e.target.value)}
        className={fieldClass}
      />
    </div>
  );
}
