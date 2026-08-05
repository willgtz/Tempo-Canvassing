export type AdminLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  phone: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
  geocode_precision: string | null;
  disposition_id: string | null;
  prior_sale_date: string | null;
  is_manual: boolean;
  batch_id: string | null;
  batch_filename: string | null;
  created_at: string;
};

export type Disposition = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
};
