"use client";

import { useState } from "react";
import type { Appointment, AppointmentLead, AppointmentStatus } from "./types";

// Mirrors AppointmentsCalendarView.swift's exact three sub-modes and
// behavior (iOS has no built-in calendar-grid component either — this is
// a from-scratch port, not wrapping some date-picker library). Kept
// deliberately simple to match: month shows a status-colored dot per
// appointment, week shows compact colored chips per day, day buckets
// appointments into hour rows rather than positioning by exact minute.
type SubMode = "day" | "week" | "month";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function AppointmentsCalendar({
  appointments,
  statuses,
  leadById,
  onSelect,
}: {
  appointments: Appointment[];
  statuses: AppointmentStatus[];
  leadById: Map<string, AppointmentLead>;
  onSelect: (appointmentId: string) => void;
}) {
  const [subMode, setSubMode] = useState<SubMode>("day");
  const [referenceDate, setReferenceDate] = useState(() => new Date());

  function step(direction: number) {
    if (subMode === "day") setReferenceDate((d) => addDays(d, direction));
    else if (subMode === "week") setReferenceDate((d) => addDays(d, direction * 7));
    else setReferenceDate((d) => addMonths(d, direction));
  }

  function jumpToDay(day: Date) {
    setReferenceDate(day);
    setSubMode("day");
  }

  const statusColor = (statusId: string) => statuses.find((s) => s.id === statusId)?.color ?? "#6B7280";

  let periodTitle: string;
  if (subMode === "day") {
    periodTitle = referenceDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  } else if (subMode === "week") {
    const start = startOfWeek(referenceDate);
    const end = addDays(start, 6);
    periodTitle = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  } else {
    periodTitle = referenceDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10">
      <div className="flex gap-1 border-b border-black/10 p-2 dark:border-white/10">
        {(["day", "week", "month"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSubMode(mode)}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium capitalize ${
              subMode === mode
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-b border-black/10 px-3 py-2 dark:border-white/10">
        <button onClick={() => step(-1)} className="p-1 text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white" aria-label="Previous">
          ‹
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">{periodTitle}</p>
          <button
            onClick={() => setReferenceDate(new Date())}
            className="text-xs text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
          >
            Today
          </button>
        </div>
        <button onClick={() => step(1)} className="p-1 text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white" aria-label="Next">
          ›
        </button>
      </div>

      {subMode === "month" && (
        <MonthGrid referenceDate={referenceDate} appointments={appointments} statusColor={statusColor} onSelectDay={jumpToDay} />
      )}
      {subMode === "week" && (
        <WeekGrid
          referenceDate={referenceDate}
          appointments={appointments}
          leadById={leadById}
          statusColor={statusColor}
          onSelect={onSelect}
          onSelectDay={jumpToDay}
        />
      )}
      {subMode === "day" && (
        <DayGrid referenceDate={referenceDate} appointments={appointments} leadById={leadById} statusColor={statusColor} onSelect={onSelect} />
      )}
    </div>
  );
}

function MonthGrid({
  referenceDate,
  appointments,
  statusColor,
  onSelectDay,
}: {
  referenceDate: Date;
  appointments: Appointment[];
  statusColor: (statusId: string) => string;
  onSelectDay: (day: Date) => void;
}) {
  const firstOfMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="grid grid-cols-7 gap-0.5 p-2">
      {WEEKDAY_LABELS.map((label, i) => (
        <div key={i} className="py-1 text-center text-xs font-semibold text-black/40 dark:text-white/40">
          {label}
        </div>
      ))}
      {days.map((day) => {
        const isCurrentMonth = day.getMonth() === referenceDate.getMonth();
        const dots = appointments.filter((a) => isSameDay(new Date(a.scheduled_at), day)).slice(0, 4);
        return (
          <button
            key={day.toISOString()}
            onClick={() => onSelectDay(day)}
            className="flex flex-col items-center gap-1 rounded py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                isToday(day)
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : isCurrentMonth
                    ? "text-black dark:text-white"
                    : "text-black/30 dark:text-white/30"
              }`}
            >
              {day.getDate()}
            </span>
            <span className="flex h-1.5 gap-0.5">
              {dots.map((a) => (
                <span key={a.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor(a.status_id) }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WeekGrid({
  referenceDate,
  appointments,
  leadById,
  statusColor,
  onSelect,
  onSelectDay,
}: {
  referenceDate: Date;
  appointments: Appointment[];
  leadById: Map<string, AppointmentLead>;
  statusColor: (statusId: string) => string;
  onSelect: (id: string) => void;
  onSelectDay: (day: Date) => void;
}) {
  const start = startOfWeek(referenceDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div className="grid grid-cols-7 gap-1 p-2">
      {days.map((day) => {
        const dayAppointments = appointments
          .filter((a) => isSameDay(new Date(a.scheduled_at), day))
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
        return (
          <div key={day.toISOString()} className="space-y-1">
            <button onClick={() => onSelectDay(day)} className="w-full text-center">
              <p className="text-xs text-black/40 dark:text-white/40">{day.toLocaleDateString(undefined, { weekday: "narrow" })}</p>
              <span
                className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                  isToday(day) ? "bg-black text-white dark:bg-white dark:text-black" : ""
                }`}
              >
                {day.getDate()}
              </span>
            </button>
            <div className="space-y-1">
              {dayAppointments.map((a) => {
                const lead = leadById.get(a.lead_id);
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelect(a.id)}
                    title={lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") : undefined}
                    className="h-4 w-full rounded"
                    style={{ backgroundColor: statusColor(a.status_id) }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayGrid({
  referenceDate,
  appointments,
  leadById,
  statusColor,
  onSelect,
}: {
  referenceDate: Date;
  appointments: Appointment[];
  leadById: Map<string, AppointmentLead>;
  statusColor: (statusId: string) => string;
  onSelect: (id: string) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayAppointments = appointments
    .filter((a) => isSameDay(new Date(a.scheduled_at), referenceDate))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  function hourLabel(hour: number): string {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric" });
  }

  return (
    <div className="max-h-[600px] overflow-y-auto p-2">
      {hours.map((hour) => {
        const inHour = dayAppointments.filter((a) => new Date(a.scheduled_at).getHours() === hour);
        return (
          <div key={hour} className="flex min-h-[44px] gap-2 border-t border-black/5 py-1.5 dark:border-white/10">
            <span className="w-14 shrink-0 pt-1 text-right text-xs text-black/40 dark:text-white/40">{hourLabel(hour)}</span>
            <div className="flex-1 space-y-1">
              {inHour.map((a) => {
                const lead = leadById.get(a.lead_id);
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelect(a.id)}
                    className="flex w-full items-center gap-2 rounded-lg bg-black/5 px-2 py-1.5 text-left text-sm dark:bg-white/10"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: statusColor(a.status_id) }} />
                    <span className="flex-1 truncate">{lead ? [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown lead" : "Unknown lead"}</span>
                    <span className="shrink-0 text-xs text-black/40 dark:text-white/40">
                      {new Date(a.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
