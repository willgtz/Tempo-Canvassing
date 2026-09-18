export type ArchivedLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address_line: string;
  city: string | null;
  state: string | null;
  zipcode: string;
  disposition_id: string | null;
  is_manual: boolean;
  archived_at: string;
  archived_by: string | null;
  archived_by_name: string | null;
  created_at: string;
};
