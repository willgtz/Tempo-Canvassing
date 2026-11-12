-- ============================================================
-- MIGRATION (2026-11-12): Tempo CSC rep exclusions cover openers too
--
-- An excluded rep now keeps an appointment out of Tempo CSC whether they
-- were its opener or its closer (only real assignments count, not names
-- typed into the "Additional Opener" question). Same immediate effect as
-- before: saving removes CSC leads that now match, un-excluding brings
-- them back. The column is renamed to match.
-- ============================================================

alter table special_lists rename column csc_excluded_closer_ids to csc_excluded_rep_ids;

CREATE OR REPLACE FUNCTION public.run_csc_sync()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- 1. Excluded reps: take appointments they were the opener or closer
  --    on out of CSC. A CSC lead left with no source appointments is
  --    archived (and flagged so it comes back if the rep is un-excluded).
  if array_length(v_list.csc_excluded_rep_ids, 1) > 0 then
    select coalesce(array_agg(distinct s.lead_id), '{}') into v_affected
    from special_lead_sources s
    join leads l on l.id = s.lead_id
    join appointment_assignments aa on aa.appointment_id = s.appointment_id
    where l.special_list_id = v_list.id
      and aa.user_id = any (v_list.csc_excluded_rep_ids);

    if array_length(v_affected, 1) > 0 then
      delete from special_lead_sources s
      using appointment_assignments aa
      where aa.appointment_id = s.appointment_id
        and aa.user_id = any (v_list.csc_excluded_rep_ids)
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
          and aa.user_id = any (v_list.csc_excluded_rep_ids)
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
$function$;
