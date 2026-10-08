-- Explicit one-time activation AFTER deploying 0027 and its companion app.
-- Target production project kkguxwbjwztrjwcawvum; this is NOT a migration.
-- Event identity and zero-selection guards prevent accidental reuse.
-- Compare existing data in the same transaction; any mismatch rolls back.
do $season$
declare
  v_cards text;
  v_matches text;
  v_participants text;
begin
  lock table public.session_config in exclusive mode;
  lock table public.cards, public.matches in share mode;
  if not exists(select 1 from public.session_config where id=1
      and event_id='a8842804-feb0-4987-90c9-5a07a0232fc7'::uuid
      and not continuous_mode and not purging) then
    raise exception 'UNEXPECTED_EVENT_STATE';
  end if;
  if exists(select 1 from public.matches)
     or exists(select 1 from private.event_participants where used<>0) then
    raise exception 'SELECTIONS_EXIST_STOP_TRANSITION';
  end if;
  select md5(coalesce(string_agg(to_jsonb(c)::text,',' order by c.id),'')) into v_cards from public.cards c;
  select md5(coalesce(string_agg(to_jsonb(m)::text,',' order by m.id),'')) into v_matches from public.matches m;
  select md5(coalesce(string_agg(jsonb_build_array(ep.event_id,ep.subject_key,ep.current_user_id,ep.allowance,ep.used,ep.received_reveals,ep.banned)::text,',' order by ep.subject_key),''))
    into v_participants from private.event_participants ep;
  perform public.activate_continuous_season('2027-01-30T14:59:00Z'::timestamptz,'selectable');
  if v_cards is distinct from (select md5(coalesce(string_agg(to_jsonb(c)::text,',' order by c.id),'')) from public.cards c)
     or v_matches is distinct from (select md5(coalesce(string_agg(to_jsonb(m)::text,',' order by m.id),'')) from public.matches m)
     or v_participants is distinct from (select md5(coalesce(string_agg(jsonb_build_array(ep.event_id,ep.subject_key,ep.current_user_id,ep.allowance,ep.used,ep.received_reveals,ep.banned)::text,',' order by ep.subject_key),'')) from private.event_participants ep) then
    raise exception 'DATA_PRESERVATION_CHECK_FAILED';
  end if;
end;
$season$;
select continuous_mode,board_mode,base_selection_allowance,ends_at,force_locked,public.board_is_open() as board_open,
  (select count(*) from public.cards) cards,(select count(*) from private.event_participants) participants,
  (select count(*) from public.matches) matches,(select coalesce(sum(used),0) from private.event_participants) lifetime_choices,
  (select min(allowance-used) from private.event_participants) minimum_remaining,
  (select count(*) from private.event_participants where season_accepted_at is null) consent_pending
from public.session_config where id=1;
