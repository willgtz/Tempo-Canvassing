import type { PreviewRow } from "./types";

export type CsvField =
  | "firstName"
  | "lastName"
  | "addressLine"
  | "city"
  | "state"
  | "zipcode"
  | "phone"
  | "email"
  | "priorSaleDate";

export const FIELD_LABELS: Record<CsvField, string> = {
  firstName: "First Name",
  lastName: "Last Name",
  addressLine: "Address",
  city: "City",
  state: "State",
  zipcode: "Zip",
  phone: "Phone",
  email: "Email",
  priorSaleDate: "Sold Date",
};

// Fields the insert can't proceed without (leads.address_line / leads.zipcode
// are NOT NULL in schema.sql).
const REQUIRED_FIELDS: CsvField[] = ["addressLine", "zipcode"];

// Checked first, as exact matches against the normalized header. Field order
// here also sets priority when resolving ambiguous headers below.
const EXACT_ALIASES: Record<CsvField, string[]> = {
  addressLine: [
    "address",
    "street",
    "streetaddress",
    "addressline",
    "addressline1",
    "address1",
    "propertyaddress",
    "siteaddress",
    "situsaddress",
    "mailingaddress",
    "fulladdress",
  ],
  zipcode: ["zip", "zipcode", "postalcode", "postal", "zip5"],
  city: ["city", "town"],
  state: ["state", "st", "province"],
  firstName: ["firstname", "first", "fname"],
  lastName: ["lastname", "last", "lname", "surname"],
  phone: ["phone", "phonenumber", "mobile", "cell", "telephone"],
  email: ["email", "emailaddress", "e-mail"],
  priorSaleDate: [
    "datesold",
    "solddate",
    "saledate",
    "dateofsale",
    "lastsaledate",
    "lastsolddate",
    "saleddate",
  ],
};

// Looser fallback: header just needs to *contain* one of these. Only used
// for fields that didn't get an exact match, and only against headers not
// already claimed by another field, so a header can't be double-matched.
const SUBSTRING_ALIASES: Partial<Record<CsvField, string[]>> = {
  addressLine: ["address"],
  zipcode: ["zip", "postal"],
  city: ["city"],
  state: ["state"],
  firstName: ["first"],
  lastName: ["last"],
  phone: ["phone", "mobile", "cell"],
  email: ["email"],
  priorSaleDate: ["sold", "saledate"],
};

const FIELD_ORDER: CsvField[] = [
  "addressLine",
  "zipcode",
  "city",
  "state",
  "firstName",
  "lastName",
  "phone",
  "email",
  "priorSaleDate",
];

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function detectColumnMap(
  headers: string[]
): Partial<Record<CsvField, string>> {
  const normalized = headers.map((h) => ({
    original: h,
    normalized: normalizeHeader(h),
  }));
  const claimed = new Set<string>();
  const map: Partial<Record<CsvField, string>> = {};

  for (const field of FIELD_ORDER) {
    const aliases = EXACT_ALIASES[field];
    const match = normalized.find(
      (h) => !claimed.has(h.original) && aliases.includes(h.normalized)
    );
    if (match) {
      map[field] = match.original;
      claimed.add(match.original);
    }
  }

  for (const field of FIELD_ORDER) {
    if (map[field]) continue;
    const aliases = SUBSTRING_ALIASES[field];
    if (!aliases) continue;
    const match = normalized.find(
      (h) => !claimed.has(h.original) && aliases.some((a) => h.normalized.includes(a))
    );
    if (match) {
      map[field] = match.original;
      claimed.add(match.original);
    }
  }

  return map;
}

export function missingRequiredColumns(
  fieldMap: Partial<Record<CsvField, string>>
): CsvField[] {
  return REQUIRED_FIELDS.filter((field) => !fieldMap[field]);
}

// Best-effort: CSV date formats vary a lot and this field is informational
// context, not safety-critical like address/zip, so an unparseable value
// is just dropped (left null) rather than failing the row.
function parseDateCell(raw: string): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  if (year < 1900 || year > 2100) return null;
  return parsed.toISOString().slice(0, 10);
}

function cell(
  row: Record<string, string>,
  field: CsvField,
  fieldMap: Partial<Record<CsvField, string>>
): string {
  const key = fieldMap[field];
  if (!key) return "";
  return (row[key] ?? "").trim();
}

export function rowsToPreview(
  data: Record<string, string>[],
  fieldMap: Partial<Record<CsvField, string>>
): PreviewRow[] {
  return data.map((row, index) => {
    const addressLine = cell(row, "addressLine", fieldMap);
    const zipcode = cell(row, "zipcode", fieldMap);

    const missing: string[] = [];
    if (!addressLine) missing.push("address");
    if (!zipcode) missing.push("zip");

    return {
      rowIndex: index,
      firstName: cell(row, "firstName", fieldMap) || null,
      lastName: cell(row, "lastName", fieldMap) || null,
      addressLine,
      city: cell(row, "city", fieldMap) || null,
      state: cell(row, "state", fieldMap) || null,
      zipcode,
      phone: cell(row, "phone", fieldMap) || null,
      email: cell(row, "email", fieldMap) || null,
      priorSaleDate: parseDateCell(cell(row, "priorSaleDate", fieldMap)),
      validationError: missing.length
        ? `Missing required ${missing.join(" and ")}`
        : null,
    };
  });
}

export function fullAddress(row: PreviewRow): string {
  return [row.addressLine, row.city, [row.state, row.zipcode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}
