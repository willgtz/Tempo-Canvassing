-- Financing types get a "works like" behavior so new ones can be added
-- from HIC Settings without code changes: every form/validation/price
-- rule in the app keys off works_like, not the financing type's own key.
--   lightreach   — PPA: escalator + kWh rate, contract price calculated
--   sungage_loan — loan: APR, term, payment after 36 months
--   cash         — cash: signing/install/PTO payments, battery-only allowed

alter table public.hic_financing_types
  add column if not exists works_like text;

update public.hic_financing_types
set works_like = case key when 'sungage_loan' then 'sungage_loan' when 'cash' then 'cash' else 'lightreach' end
where works_like is null;

alter table public.hic_financing_types
  alter column works_like set not null,
  alter column works_like set default 'lightreach';

alter table public.hic_financing_types
  drop constraint if exists hic_financing_types_works_like_check;
alter table public.hic_financing_types
  add constraint hic_financing_types_works_like_check
  check (works_like in ('lightreach', 'sungage_loan', 'cash'));

-- Enfin: works like LightReach.
insert into public.hic_financing_types (key, label, is_enabled, sort_order, works_like)
values ('enfin', 'Enfin', true, 3, 'lightreach')
on conflict (key) do nothing;

-- The Enfin HIC template was uploaded under LightReach; move it to Enfin.
update public.hic_templates
set financing_type_id = (select id from public.hic_financing_types where key = 'enfin')
where key = 'Enfin_HIC';

-- Enfin's package: its own HIC (Henderson form still applies by city).
insert into public.hic_package_rules (template_key, financing_type_id, condition_type, is_enabled, sort_order)
select 'Enfin_HIC', ft.id, 'always', true, 5
from public.hic_financing_types ft
where ft.key = 'enfin'
  and not exists (
    select 1 from public.hic_package_rules r where r.financing_type_id = ft.id and r.template_key = 'Enfin_HIC'
  );

-- Start Enfin with LightReach's current active panel(s); editable in Settings.
insert into public.hic_panel_options (financing_type_id, model_name, wattage_w, is_active)
select enfin.id, p.model_name, p.wattage_w, true
from public.hic_panel_options p
join public.hic_financing_types lr on lr.id = p.financing_type_id and lr.key = 'lightreach'
cross join (select id from public.hic_financing_types where key = 'enfin') enfin
where p.is_active
  and not exists (select 1 from public.hic_panel_options x where x.financing_type_id = enfin.id);
