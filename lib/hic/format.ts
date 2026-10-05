// Display/input formatters specific to the Send HIC form and documents —
// no equivalent formatter utilities exist elsewhere in this codebase.

// Formats as the user types, e.g. "7025551234" -> "702-555-1234". Strips
// non-digits first so pasted/partial input never breaks the mask.
export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 10);
  if (digits.length > 6) return `${part1}-${part2}-${part3}`;
  if (digits.length > 3) return `${part1}-${part2}`;
  return part1;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatKw(value: number): string {
  return `${value} kW`;
}

// Thousands separators, up to 2 decimals, e.g. 14997.93 -> "14,997.93 kWh".
export function formatKwh(value: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} kWh`;
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// "Oct 4, 2026" — the exact date format required on every generated
// document. Pacific time, matching this app's existing door-knock/
// dashboard convention of treating "today" as Pacific regardless of
// server/client timezone.
export function formatDocumentDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  }).format(date);
}

const PHONE_DIGITS_RE = /^\d{10}$/;
export function isValidPhoneInput(value: string): boolean {
  return PHONE_DIGITS_RE.test(value.replace(/\D/g, ""));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}
