-- ============================================================
-- MIGRATION (2026-10-14): LightReach contract price is editable
--
-- Reps only see OpenSolar's rounded production (12,264 instead of
-- LightReach's 12,263.59), which throws the formula's 25-year contract
-- price off by cents to a couple of dollars. The form now prefills the
-- calculated price but lets the rep/admin type LightReach's exact one.
-- contract_price stays the price on the contract; this column keeps what
-- the formula produced so the admin page can show when it was edited.
-- Null for Sungage Loan / Cash (no formula).
-- ============================================================

alter table hics
  add column if not exists calculated_contract_price numeric(12, 2);

-- Every existing LightReach price came straight from the formula.
update hics h
set calculated_contract_price = h.contract_price
from hic_financing_types ft
where ft.id = h.financing_type_id
  and ft.key = 'lightreach'
  and h.calculated_contract_price is null;
