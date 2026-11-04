// Value handling for PickerInput's Duo calendar. Uses the same string formats
// as native date inputs ("YYYY-MM-DD" and "YYYY-MM-DDTHH:mm"), so callers don't
// need to know which control was shown. Works on calendar parts rather than
// Date objects wherever possible, so a timezone can't shift the chosen day.

export type PickerParts = {
  date: string | null;
  hour12: number;
  minute: number;
  period: "AM" | "PM";
};

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function parsePickerValue(value: string): PickerParts {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return { date: null, hour12: 9, minute: 0, period: "AM" };
  const hour24 = match[2] === undefined ? 9 : Number(match[2]);
  return {
    date: match[1],
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute: match[3] === undefined ? 0 : Number(match[3]),
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

export function formatPickerValue(parts: PickerParts, withTime: boolean): string {
  if (!parts.date) return "";
  if (!withTime) return parts.date;
  const hour24 = (parts.hour12 % 12) + (parts.period === "PM" ? 12 : 0);
  return `${parts.date}T${pad(hour24)}:${pad(parts.minute)}`;
}

// One row per week, Sunday first, with null for days outside the month.
export function monthGrid(year: number, monthIndex: number): (string | null)[][] {
  const leadingBlanks = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (string | null)[] = Array(leadingBlanks).fill(null);
  for (let day = 1; day <= dayCount; day++) cells.push(isoDate(year, monthIndex, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// min and max may be date-only or date-time. Only the day is compared, because
// the calendar only offers whole days.
export function isDayAllowed(day: string, min?: string, max?: string): boolean {
  if (min && day < min.slice(0, 10)) return false;
  if (max && day > max.slice(0, 10)) return false;
  return true;
}
