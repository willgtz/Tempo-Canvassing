-- ============================================================
-- MIGRATION (2026-10-13): Team leads see manual pins in their own zips
--
-- Since 2026-09-22 a manual (cold-knock) lead is only reachable via:
-- admin, its creator, the creator's teammates, or an appointment
-- assignment — zip assignment deliberately grants nothing for manual
-- leads. William asked for one addition: a user whose role is
-- team_lead can see AND work (update) manual pins entered by anyone,
-- as long as the pin sits in a zip assigned DIRECTLY to that team lead
-- (their own active zip_assignments — not subordinates' or teammates'
-- zips). Regular reps are unchanged; every existing clause stays.
--
-- lead_notes (notes_select) and lead_history (history_select) already
-- scope through "lead_id in (select id from leads)", so they inherit
-- this automatically.
-- ============================================================

-- Zips a team lead holds directly. Empty for anyone who isn't an active
-- team_lead, so the policy clause below is a no-op for every other role.
create or replace function team_lead_own_zipcodes(uid uuid)
returns table(zipcode text)
language sql
stable
security definer
as $$
  select distinct za.zipcode
  from zip_assignments za
  join profiles p on p.id = za.user_id
  where za.user_id = uid
    and za.unassigned_at is null
    and p.role = 'team_lead'
    and p.active;
$$;

drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads
  for select
  using (
    deleted_at is null
    and archived_at is null
    and (
      is_admin(auth.uid())
      or (not is_manual and zipcode in (select zipcode from visible_zipcodes(auth.uid())))
      or (is_manual and entered_by = auth.uid())
      or (is_manual and entered_by in (select teammate_ids(auth.uid())))
      or (is_manual and zipcode in (select zipcode from team_lead_own_zipcodes(auth.uid())))
      or exists (
        select 1 from appointments a
        join appointment_assignments aa on aa.appointment_id = a.id
        where a.lead_id = leads.id and aa.user_id = auth.uid()
      )
    )
  );

drop policy if exists "leads_update" on leads;
create policy "leads_update" on leads
  for update
  using (
    deleted_at is null
    and archived_at is null
    and (
      is_admin(auth.uid())
      or (not is_manual and zipcode in (select zipcode from visible_zipcodes(auth.uid())))
      or (is_manual and entered_by = auth.uid())
      or (is_manual and entered_by in (select teammate_ids(auth.uid())))
      or (is_manual and zipcode in (select zipcode from team_lead_own_zipcodes(auth.uid())))
      or exists (
        select 1 from appointments a
        join appointment_assignments aa on aa.appointment_id = a.id
        where a.lead_id = leads.id and aa.user_id = auth.uid()
      )
    )
  );

create or replace function update_lead_name_for_appointment(p_lead_id uuid, p_first_name text, p_last_name text)
returns void
language plpgsql
security definer
as $$
declare
  v_zipcode text;
  v_is_manual boolean;
  v_entered_by uuid;
begin
  select zipcode, is_manual, entered_by into v_zipcode, v_is_manual, v_entered_by
  from leads where id = p_lead_id;

  if not (
    is_admin(auth.uid())
    or (not v_is_manual and v_zipcode in (select zipcode from visible_zipcodes(auth.uid())))
    or (v_is_manual and v_entered_by = auth.uid())
    or (v_is_manual and v_entered_by in (select teammate_ids(auth.uid())))
    or (v_is_manual and v_zipcode in (select zipcode from team_lead_own_zipcodes(auth.uid())))
    or exists (
      select 1
      from appointments a
      join appointment_assignments aa on aa.appointment_id = a.id
      where a.lead_id = p_lead_id and aa.user_id = auth.uid()
    )
  ) then
    raise exception 'Not authorized to update this lead''s name';
  end if;

  update leads
  set first_name = p_first_name, last_name = p_last_name, updated_at = now()
  where id = p_lead_id;
end;
$$;

-- Admin debug view ("who can see this lead and why") — keep it in sync
-- with the policy so team-lead zip access shows up as its own reason.
create or replace function lead_visibility(p_lead_id uuid)
returns table(user_id uuid, full_name text, reasons text[])
language plpgsql
security definer
as $$
declare
  v_zipcode text;
  v_is_manual boolean;
  v_entered_by uuid;
begin
  if not is_admin(auth.uid()) then
    raise exception 'Not authorized to view lead visibility';
  end if;

  select zipcode, is_manual, entered_by into v_zipcode, v_is_manual, v_entered_by
  from leads where id = p_lead_id;

  return query
    with reasons as (
      select p.id as pid, p.full_name as pfull_name,
        array_remove(array[
          case when p.role in ('admin', 'super_admin') then 'admin' end,
          case when not v_is_manual and v_zipcode in (select zipcode from visible_zipcodes(p.id)) then 'zip' end,
          case when v_is_manual and p.id = v_entered_by then 'manual_entry' end,
          case when v_is_manual and v_entered_by is not null and p.id in (select teammate_ids(v_entered_by)) then 'teammate_manual_entry' end,
          case when v_is_manual and v_zipcode in (select zipcode from team_lead_own_zipcodes(p.id)) then 'team_lead_zip' end,
          case when exists (
            select 1 from appointment_assignments aa
            join appointments a on a.id = aa.appointment_id
            where a.lead_id = p_lead_id and aa.user_id = p.id
          ) then 'appointment_assignment' end
        ], null) as reason_list
      from profiles p
      where p.active
    )
    select reasons.pid, reasons.pfull_name, reasons.reason_list
    from reasons
    where array_length(reasons.reason_list, 1) > 0
    order by reasons.pfull_name;
end;
$$;
