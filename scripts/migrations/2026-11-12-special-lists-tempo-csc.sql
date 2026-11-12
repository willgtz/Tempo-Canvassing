-- ============================================================
-- MIGRATION (2026-11-12): Special lead lists + Tempo CSC
--
-- Special lists hold leads that are hidden from normal zip-based
-- visibility. A rep only sees a list's leads once a super admin grants
-- them access to that list; admins always see every list. Only super
-- admins create lists, upload to them, and grant/remove access.
--
-- On the leads they can see, access holders work like normal: notes,
-- routing, setting appointments. A special lead's main status is always
-- its list's name; leads.disposition_id holds its sub-dispo. "Dead Lead"
-- is a sub-dispo only special leads can use.
--
-- Tempo CSC (Tempo Customer Support Check) is the one list with an
-- automatic feed. run_csc_sync() (daily cron + "Run check now" in its
-- settings) copies an appointment's lead into the list once the
-- appointment has gone 14 days with no activity. The clock starts at
-- whichever is latest: the scheduled time, the last note, the last status
-- change, or the last reschedule. Activity before the scheduled time
-- therefore never matters. One CSC lead per address: a later neglected
-- appointment at the same address attaches to the existing lead
-- (special_lead_sources keeps every one). CSC activity lives on the CSC
-- lead only and never touches the original appointment.
-- ============================================================

-- ---------- Tables ----------

create table if not exists special_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#F59E0B',
  is_csc boolean not null default false,
  -- Tempo CSC feed rules. Status exclusions only apply going forward;
  -- closer exclusions also remove CSC leads that already match.
  csc_excluded_status_ids uuid[] not null default '{}',
  csc_excluded_closer_ids uuid[] not null default '{}',
  -- A lead stays in the list either way, but leaves the map when its
  -- sub-dispo is one of these, or when an appointment set from it has
  -- one of these statuses (Closed = sold).
  map_hidden_disposition_ids uuid[] not null default '{}',
  map_hidden_appointment_status_ids uuid[] not null default '{}',
  csc_last_run_at timestamptz,
  csc_last_run_summary jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists special_lists_name_key on special_lists (lower(name));
create unique index if not exists special_lists_one_csc on special_lists (is_csc) where is_csc;

create table if not exists special_list_access (
  list_id uuid not null references special_lists(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create index if not exists idx_special_list_access_user on special_list_access(user_id);

alter table leads add column if not exists special_list_id uuid references special_lists(id);
-- Set when run_csc_sync archived a CSC lead because its closer became
-- excluded, so the lead comes back (with its notes) if that closer is
-- un-excluded later. A super admin's manual removal leaves it false.
alter table leads add column if not exists special_auto_removed boolean not null default false;

create index if not exists idx_leads_special_list on leads(special_list_id) where special_list_id is not null;

-- Which original appointments a CSC lead came from.
create table if not exists special_lead_sources (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  appointment_id uuid not null unique references appointments(id) on delete cascade,
  added_at timestamptz not null default now()
);

create index if not exists idx_special_lead_sources_lead on special_lead_sources(lead_id);

-- The original appointment a CSC lead came from, set automatically when
-- someone sets a new appointment on that CSC lead.
alter table appointments add column if not exists origin_appointment_id uuid references appointments(id) on delete set null;
-- Activity timestamps for the CSC 14-day clock.
alter table appointments add column if not exists status_changed_at timestamptz;
alter table appointments add column if not exists scheduled_changed_at timestamptz;

alter table dispositions add column if not exists special_only boolean not null default false;

-- Backfill the activity timestamps for existing appointments. Status
-- changes were never logged, so the last time the row changed stands in
-- for the last status change. That's conservative: it can only make an
-- appointment look more recently touched, never less.
update appointments
set status_changed_at = updated_at
where status_changed_at is null and updated_at > created_at + interval '1 minute';

update appointments a
set scheduled_changed_at = h.last_change
from (
  select appointment_id, max(changed_at) as last_change
  from appointment_history
  where field_changed = 'scheduled_at'
  group by appointment_id
) h
where h.appointment_id = a.id and a.scheduled_changed_at is null;

-- ---------- Helper functions ----------

create or replace function is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = uid and role = 'super_admin' and active = true
  );
$$;

create or replace function has_special_list_access(p_list_id uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from special_list_access a
    join profiles p on p.id = a.user_id
    where a.list_id = p_list_id and a.user_id = uid and p.active = true
  );
$$;

create or replace function special_address_key(p_address_line text, p_zipcode text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(p_address_line, '')), '[^a-z0-9]', '', 'g') || '|' || coalesce(p_zipcode, '');
$$;

-- ---------- Triggers ----------

create or replace function track_appointment_activity()
returns trigger
language plpgsql
as $$
begin
  if new.status_id is distinct from old.status_id then
    new.status_changed_at := now();
  end if;
  if new.scheduled_at is distinct from old.scheduled_at then
    new.scheduled_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_track_appointment_activity on appointments;
create trigger trg_track_appointment_activity
  before update on appointments
  for each row execute function track_appointment_activity();

create or replace function set_appointment_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.origin_appointment_id is null then
    select s.appointment_id into new.origin_appointment_id
    from special_lead_sources s
    join appointments a on a.id = s.appointment_id
    where s.lead_id = new.lead_id
    order by a.scheduled_at desc
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_appointment_origin on appointments;
create trigger trg_set_appointment_origin
  before insert on appointments
  for each row execute function set_appointment_origin();

-- Special-only sub-dispos (Dead Lead) can never land on a regular lead,
-- and only super admins can put a lead in a special list or move it
-- between lists. auth.uid() is null for the service role (cron, CSC sync).
create or replace function guard_lead_special_list()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.special_list_id is null
    and new.disposition_id is not null
    and exists (select 1 from dispositions where id = new.disposition_id and special_only)
  then
    raise exception 'That status can only be used on special list leads';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.special_list_id is not null and not is_super_admin(auth.uid()) then
      raise exception 'Only super admins can add leads to a special list';
    end if;
  elsif new.special_list_id is distinct from old.special_list_id and not is_super_admin(auth.uid()) then
    raise exception 'Only super admins can move leads between lists';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_lead_special_list on leads;
create trigger trg_guard_lead_special_list
  before insert or update on leads
  for each row execute function guard_lead_special_list();

-- ---------- Row Level Security ----------

alter table special_lists enable row level security;
alter table special_list_access enable row level security;
alter table special_lead_sources enable row level security;

drop policy if exists "special_lists_select" on special_lists;
create policy "special_lists_select" on special_lists
  for select
  using (is_admin(auth.uid()) or has_special_list_access(id, auth.uid()));

drop policy if exists "special_lists_super_admin_write" on special_lists;
create policy "special_lists_super_admin_write" on special_lists
  for all
  using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));

drop policy if exists "special_list_access_select" on special_list_access;
create policy "special_list_access_select" on special_list_access
  for select
  using (is_admin(auth.uid()) or user_id = auth.uid());

drop policy if exists "special_list_access_super_admin_write" on special_list_access;
create policy "special_list_access_super_admin_write" on special_list_access
  for all
  using (is_super_admin(auth.uid()))
  with check (is_super_admin(auth.uid()));

-- Access holders read sources through get_special_lead_details() instead.
drop policy if exists "special_lead_sources_select_admin" on special_lead_sources;
create policy "special_lead_sources_select_admin" on special_lead_sources
  for select
  using (is_admin(auth.uid()));

-- Same clauses as before, except zip/manual-entry visibility now applies
-- to regular leads only, and special leads add list access.
drop policy if exists "leads_select" on leads;
create policy "leads_select" on leads
  for select
  using (
    deleted_at is null
    and archived_at is null
    and (
      is_admin(auth.uid())
      or (
        special_list_id is null
        and (
          ((not is_manual) and zipcode in (select zipcode from visible_zipcodes(auth.uid())))
          or (is_manual and entered_by = auth.uid())
          or (is_manual and entered_by in (select teammate_ids(auth.uid())))
          or (is_manual and zipcode in (select zipcode from team_lead_own_zipcodes(auth.uid())))
        )
      )
      or (special_list_id is not null and has_special_list_access(special_list_id, auth.uid()))
      or exists (
        select 1
        from appointments a
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
      or (
        special_list_id is null
        and (
          ((not is_manual) and zipcode in (select zipcode from visible_zipcodes(auth.uid())))
          or (is_manual and entered_by = auth.uid())
          or (is_manual and entered_by in (select teammate_ids(auth.uid())))
          or (is_manual and zipcode in (select zipcode from team_lead_own_zipcodes(auth.uid())))
        )
      )
      or (special_list_id is not null and has_special_list_access(special_list_id, auth.uid()))
      or exists (
        select 1
        from appointments a
        join appointment_assignments aa on aa.appointment_id = a.id
        where a.lead_id = leads.id and aa.user_id = auth.uid()
      )
    )
  );

-- ---------- Existing functions that check lead access ----------

create or replace function update_lead_name_for_appointment(p_lead_id uuid, p_first_name text, p_last_name text)
returns void
language plpgsql
security definer
as $function$
declare
  v_zipcode text;
  v_is_manual boolean;
  v_entered_by uuid;
  v_special_list_id uuid;
begin
  select zipcode, is_manual, entered_by, special_list_id
  into v_zipcode, v_is_manual, v_entered_by, v_special_list_id
  from leads where id = p_lead_id;

  if not (
    is_admin(auth.uid())
    or (v_special_list_id is null and not v_is_manual and v_zipcode in (select zipcode from visible_zipcodes(auth.uid())))
    or (v_special_list_id is null and v_is_manual and v_entered_by = auth.uid())
    or (v_special_list_id is null and v_is_manual and v_entered_by in (select teammate_ids(auth.uid())))
    or (v_special_list_id is null and v_is_manual and v_zipcode in (select zipcode from team_lead_own_zipcodes(auth.uid())))
    or (v_special_list_id is not null and has_special_list_access(v_special_list_id, auth.uid()))
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
$function$;

-- Removing a special lead is admin-only; team leads can still archive
-- regular leads as before.
create or replace function archive_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
as $function$
begin
  if not exists (
    select 1 from profiles
    where id = auth.uid() and active = true and role in ('team_lead', 'admin', 'super_admin')
  ) then
    raise exception 'Not authorized to archive leads';
  end if;

  if exists (select 1 from leads where id = p_lead_id and special_list_id is not null)
    and not is_admin(auth.uid())
  then
    raise exception 'Only admins can remove special list leads';
  end if;

  update leads
  set archived_at = now(), archived_by = auth.uid(), special_auto_removed = false, updated_at = now()
  where id = p_lead_id and archived_at is null;
end;
$function$;

create or replace function lead_visibility(p_lead_id uuid)
returns table(user_id uuid, full_name text, reasons text[])
language plpgsql
security definer
as $function$
declare
  v_zipcode text;
  v_is_manual boolean;
  v_entered_by uuid;
  v_special_list_id uuid;
begin
  if not is_admin(auth.uid()) then
    raise exception 'Not authorized to view lead visibility';
  end if;

  select zipcode, is_manual, entered_by, special_list_id
  into v_zipcode, v_is_manual, v_entered_by, v_special_list_id
  from leads where id = p_lead_id;

  return query
    with reasons as (
      select p.id as pid, p.full_name as pfull_name,
        array_remove(array[
          case when p.role in ('admin', 'super_admin') then 'admin' end,
          case when v_special_list_id is null and not v_is_manual and v_zipcode in (select zipcode from visible_zipcodes(p.id)) then 'zip' end,
          case when v_special_list_id is null and v_is_manual and p.id = v_entered_by then 'manual_entry' end,
          case when v_special_list_id is null and v_is_manual and v_entered_by is not null and p.id in (select teammate_ids(v_entered_by)) then 'teammate_manual_entry' end,
          case when v_special_list_id is null and v_is_manual and v_zipcode in (select zipcode from team_lead_own_zipcodes(p.id)) then 'team_lead_zip' end,
          case when v_special_list_id is not null and has_special_list_access(v_special_list_id, p.id) then 'special_list_access' end,
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
$function$;

-- ---------- Special lead RPCs ----------

-- Everything an access holder sees about a special lead beyond the lead
-- row itself: the original appointment(s) it came from, with their
-- notes, history, opener/closer, form answers and HICs, plus every
-- appointment set from the special lead since (whoever set it).
create or replace function get_special_lead_details(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_list_id uuid;
begin
  select special_list_id into v_list_id
  from leads
  where id = p_lead_id and deleted_at is null;

  if v_list_id is null then
    return null;
  end if;

  if not (is_admin(auth.uid()) or has_special_list_access(v_list_id, auth.uid())) then
    raise exception 'Not authorized to view this lead';
  end if;

  return jsonb_build_object(
    'sources', coalesce((
      select jsonb_agg(src.details order by src.scheduled_at desc)
      from (
        select a.scheduled_at, jsonb_build_object(
          'appointment_id', a.id,
          'original_lead_id', a.lead_id,
          'added_at', s.added_at,
          'scheduled_at', a.scheduled_at,
          'created_at', a.created_at,
          'status_name', st.name,
          'status_color', st.color,
          'created_by_name', (select p.full_name from profiles p where p.id = a.created_by),
          'openers', coalesce((
            select jsonb_agg(p.full_name order by aa.assigned_at)
            from appointment_assignments aa join profiles p on p.id = aa.user_id
            where aa.appointment_id = a.id and aa.role = 'opener'
          ), '[]'::jsonb),
          'closers', coalesce((
            select jsonb_agg(p.full_name order by aa.assigned_at)
            from appointment_assignments aa join profiles p on p.id = aa.user_id
            where aa.appointment_id = a.id and aa.role = 'closer'
          ), '[]'::jsonb),
          'responses', coalesce((
            select jsonb_agg(jsonb_build_object('label', f.label, 'value', a.custom_field_responses ->> f.id::text) order by f.sort_order)
            from appointment_form_fields f
            where coalesce(a.custom_field_responses ->> f.id::text, '') <> ''
          ), '[]'::jsonb),
          'notes', coalesce((
            select jsonb_agg(jsonb_build_object('note', n.note, 'created_at', n.created_at, 'author_name', coalesce(p.full_name, 'Unknown')) order by n.created_at desc)
            from appointment_notes n left join profiles p on p.id = n.user_id
            where n.appointment_id = a.id
          ), '[]'::jsonb),
          'history', coalesce((
            select jsonb_agg(jsonb_build_object('field_changed', h.field_changed, 'old_value', h.old_value, 'new_value', h.new_value, 'changed_at', h.changed_at, 'author_name', coalesce(p.full_name, 'System')) order by h.changed_at desc)
            from appointment_history h left join profiles p on p.id = h.user_id
            where h.appointment_id = a.id
          ), '[]'::jsonb),
          'hics', coalesce((
            select jsonb_agg(jsonb_build_object(
              'status', hc.status,
              'financing', ft.label,
              'contract_price', hc.contract_price,
              'system_size_kw', hc.system_size_kw,
              'sent_at', hc.sent_at,
              'completed_at', hc.completed_at
            ) order by hc.created_at desc)
            from hics hc left join hic_financing_types ft on ft.id = hc.financing_type_id
            where hc.appointment_id = a.id and hc.archived_at is null
          ), '[]'::jsonb)
        ) as details
        from special_lead_sources s
        join appointments a on a.id = s.appointment_id
        join appointment_statuses st on st.id = a.status_id
        where s.lead_id = p_lead_id
      ) src
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'appointment_id', a.id,
        'scheduled_at', a.scheduled_at,
        'status_name', st.name,
        'status_color', st.color,
        'created_by_name', (select p.full_name from profiles p where p.id = a.created_by),
        'closers', coalesce((
          select jsonb_agg(p.full_name order by aa.assigned_at)
          from appointment_assignments aa join profiles p on p.id = aa.user_id
          where aa.appointment_id = a.id and aa.role = 'closer'
        ), '[]'::jsonb)
      ) order by a.scheduled_at desc)
      from appointments a
      join appointment_statuses st on st.id = a.status_id
      where a.lead_id = p_lead_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Special leads the caller can see that have an appointment in one of
-- their list's map-hiding statuses (Closed = sold). Needed as an RPC
-- because access holders can't read appointments they aren't assigned to.
create or replace function special_leads_hidden_by_appointment()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from leads l
  join special_lists sl on sl.id = l.special_list_id
  where l.deleted_at is null
    and l.archived_at is null
    and (is_admin(auth.uid()) or has_special_list_access(sl.id, auth.uid()))
    and exists (
      select 1 from appointments a
      where a.lead_id = l.id and a.status_id = any (sl.map_hidden_appointment_status_ids)
    );
$$;

-- The Tempo CSC feed. Run by the daily cron and the "Run check now"
-- button, both through the service role; not callable by users directly.
create or replace function run_csc_sync()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list special_lists;
  v_affected uuid[];
  v_removed int := 0;
  v_added int := 0;
  v_attached int := 0;
  v_restored int := 0;
  v_target uuid;
  v_target_archived boolean;
  v_appt record;
  v_summary jsonb;
begin
  select * into v_list from special_lists where is_csc limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'No Tempo CSC list exists');
  end if;

  -- 1. Excluded closers: take their appointments out of CSC. A CSC lead
  --    left with no source appointments is archived (and flagged so it
  --    comes back if the closer is un-excluded).
  if array_length(v_list.csc_excluded_closer_ids, 1) > 0 then
    select coalesce(array_agg(distinct s.lead_id), '{}') into v_affected
    from special_lead_sources s
    join leads l on l.id = s.lead_id
    join appointment_assignments aa on aa.appointment_id = s.appointment_id
    where l.special_list_id = v_list.id
      and aa.role = 'closer'
      and aa.user_id = any (v_list.csc_excluded_closer_ids);

    if array_length(v_affected, 1) > 0 then
      delete from special_lead_sources s
      using appointment_assignments aa
      where aa.appointment_id = s.appointment_id
        and aa.role = 'closer'
        and aa.user_id = any (v_list.csc_excluded_closer_ids)
        and s.lead_id = any (v_affected);

      update leads l
      set archived_at = now(), archived_by = null, special_auto_removed = true, updated_at = now()
      where l.id = any (v_affected)
        and l.archived_at is null
        and l.deleted_at is null
        and not exists (select 1 from special_lead_sources s where s.lead_id = l.id);
      get diagnostics v_removed = row_count;
    end if;
  end if;

  -- 2. Newly neglected appointments.
  for v_appt in
    select a.id as appointment_id, l.*
    from appointments a
    join leads l on l.id = a.lead_id
    where l.deleted_at is null
      and l.archived_at is null
      and l.special_list_id is null
      and not (a.status_id = any (v_list.csc_excluded_status_ids))
      and not exists (
        select 1 from appointment_assignments aa
        where aa.appointment_id = a.id
          and aa.role = 'closer'
          and aa.user_id = any (v_list.csc_excluded_closer_ids)
      )
      and not exists (select 1 from special_lead_sources s where s.appointment_id = a.id)
      and greatest(
        a.scheduled_at,
        coalesce(a.status_changed_at, a.scheduled_at),
        coalesce(a.scheduled_changed_at, a.scheduled_at),
        coalesce((select max(n.created_at) from appointment_notes n where n.appointment_id = a.id), a.scheduled_at)
      ) <= now() - interval '14 days'
    order by a.scheduled_at
  loop
    v_target := null;

    select l2.id, l2.archived_at is not null
    into v_target, v_target_archived
    from leads l2
    where l2.special_list_id = v_list.id
      and l2.deleted_at is null
      and (l2.archived_at is null or l2.special_auto_removed)
      and special_address_key(l2.address_line, l2.zipcode) = special_address_key(v_appt.address_line, v_appt.zipcode)
    order by (l2.archived_at is null) desc, l2.created_at
    limit 1;

    if v_target is null then
      insert into leads (
        first_name, last_name, address_line, city, state, zipcode, phone, email,
        lat, lng, geocode_precision, geocoded_at, prior_sale_date, is_manual, special_list_id
      ) values (
        v_appt.first_name, v_appt.last_name, v_appt.address_line, v_appt.city, v_appt.state, v_appt.zipcode,
        v_appt.phone, v_appt.email, v_appt.lat, v_appt.lng, v_appt.geocode_precision, v_appt.geocoded_at,
        v_appt.prior_sale_date, false, v_list.id
      )
      returning id into v_target;
      v_added := v_added + 1;
    else
      if v_target_archived then
        update leads
        set archived_at = null, archived_by = null, special_auto_removed = false, updated_at = now()
        where id = v_target;
        v_restored := v_restored + 1;
      else
        v_attached := v_attached + 1;
      end if;
    end if;

    insert into special_lead_sources (lead_id, appointment_id)
    values (v_target, v_appt.appointment_id)
    on conflict (appointment_id) do nothing;
  end loop;

  v_summary := jsonb_build_object(
    'added', v_added,
    'attached', v_attached,
    'restored', v_restored,
    'removed', v_removed
  );

  update special_lists
  set csc_last_run_at = now(), csc_last_run_summary = v_summary
  where id = v_list.id;

  return v_summary || jsonb_build_object('ok', true);
end;
$$;

revoke execute on function run_csc_sync() from public, anon, authenticated;
grant execute on function run_csc_sync() to service_role;

-- ---------- Seed data ----------

insert into dispositions (name, color, sort_order, is_default, special_only)
select 'Dead Lead', '#374151', coalesce(max(sort_order), 0) + 1, false, true
from dispositions
having not exists (select 1 from dispositions where lower(name) = 'dead lead');

insert into special_lists (
  name, color, is_csc,
  csc_excluded_status_ids, map_hidden_disposition_ids, map_hidden_appointment_status_ids
)
select
  'Tempo CSC', '#F59E0B', true,
  coalesce((select array_agg(id) from appointment_statuses where name = 'Closed'), '{}'),
  coalesce((select array_agg(id) from dispositions where lower(name) = 'dead lead'), '{}'),
  coalesce((select array_agg(id) from appointment_statuses where name = 'Closed'), '{}')
where not exists (select 1 from special_lists where is_csc);
