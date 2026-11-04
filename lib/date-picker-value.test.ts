import { describe, expect, it } from "vitest";
import { formatPickerValue, isDayAllowed, monthGrid, parsePickerValue } from "./date-picker-value";

describe("parsePickerValue", () => {
  it("reads a datetime-local value into 12-hour parts", () => {
    expect(parsePickerValue("2026-11-04T14:35")).toEqual({ date: "2026-11-04", hour12: 2, minute: 35, period: "PM" });
  });

  it("treats midnight and noon as 12 AM and 12 PM", () => {
    expect(parsePickerValue("2026-11-04T00:05")).toMatchObject({ hour12: 12, period: "AM" });
    expect(parsePickerValue("2026-11-04T12:05")).toMatchObject({ hour12: 12, period: "PM" });
  });

  it("falls back to no date at 9:00 AM for an empty value", () => {
    expect(parsePickerValue("")).toEqual({ date: null, hour12: 9, minute: 0, period: "AM" });
  });
});

describe("formatPickerValue", () => {
  it("round-trips every minute of the day", () => {
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute++) {
        const value = `2026-03-08T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        expect(formatPickerValue(parsePickerValue(value), true)).toBe(value);
      }
    }
  });

  it("drops the time for a date-only field", () => {
    expect(formatPickerValue(parsePickerValue("2026-11-04"), false)).toBe("2026-11-04");
  });

  it("returns an empty string when no date is chosen", () => {
    expect(formatPickerValue(parsePickerValue(""), true)).toBe("");
  });
});

describe("monthGrid", () => {
  it("places the first of the month on the right weekday", () => {
    // November 2026 starts on a Sunday and March 2027 on a Monday.
    expect(monthGrid(2026, 10)[0][0]).toBe("2026-11-01");
    expect(monthGrid(2027, 2)[0][0]).toBeNull();
    expect(monthGrid(2027, 2)[0][1]).toBe("2027-03-01");
  });

  it("includes every day and only full weeks, including leap years", () => {
    const days = monthGrid(2028, 1).flat().filter(Boolean);
    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe("2028-02-29");
    monthGrid(2028, 1).forEach((week) => expect(week).toHaveLength(7));
  });
});

describe("isDayAllowed", () => {
  it("applies inclusive bounds, ignoring any time portion", () => {
    expect(isDayAllowed("2026-11-04", "2026-11-04", "2026-11-04T08:00")).toBe(true);
    expect(isDayAllowed("2026-11-03", "2026-11-04")).toBe(false);
    expect(isDayAllowed("2026-11-05", undefined, "2026-11-04")).toBe(false);
  });

  it("allows any day when unbounded or when a bound is empty", () => {
    expect(isDayAllowed("2026-11-04", "", "")).toBe(true);
  });
});
