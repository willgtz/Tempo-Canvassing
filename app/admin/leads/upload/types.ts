export type PreviewRow = {
  rowIndex: number;
  firstName: string | null;
  lastName: string | null;
  addressLine: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  phone: string | null;
  email: string | null;
  priorSaleDate: string | null; // ISO date (YYYY-MM-DD), best-effort parsed
  validationError: string | null;
};
