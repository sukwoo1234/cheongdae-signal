-- 0026 is reserved for the separately developed, unreleased social-login work.
-- Additive migration: activation is a separate, explicit administrator action.
-- Existing cards, matches, event identity and lifetime selection counts survive.
alter table public.session_config
  add column continuous_mode boolean not null default false,
  add column previous_ends_at timestamptz;

alter table private.event_participants
  add column participation_ends_at timestamptz,
  add column season_accepted_at timestamptz,
  add column week_started_at timestamptz,
  add column weekly_used integer not null default 0 check (weekly_used >= 0),
  add column bonus_remaining integer not null default 0 check (bonus_remaining >= 0);

create function private.season_week(p_at timestamptz)
returns timestamptz language sql immutable set search_path = '' as $$
  select date_trunc('week', p_at at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
$$;
revoke all on function private.season_week(timestamptz) from public, anon, authenticated;

create or replace function private.lock_started_event_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event_id is distinct from old.event_id and old.purging then
    new.continuous_mode := false;
    new.previous_ends_at := null;
    return new;
  end if;
  if old.continuous_mode and not new.continuous_mode then
    raise exception 'SEASON_RULES_LOCKED';
  end if;
  if old.continuous_mode and (new.ends_at is distinct from old.ends_at
      or new.starts_at is distinct from old.starts_at
      or new.board_mode is distinct from old.board_mode
      or new.base_selection_allowance is distinct from old.base_selection_allowance) then
    raise exception 'SEASON_RULES_LOCKED';
  end if;
  if new.continuous_mode and not old.continuous_mode then
    if old.purging or new.ends_at <= now() or new.ends_at <= old.ends_at then
      raise exception 'INVALID_SEASON_TRANSITION';
    end if;
    -- A changed audience must not inherit already revealed contact information.
    if (new.board_mode is distinct from old.board_mode
        or new.base_selection_allowance is distinct from old.base_selection_allowance)
       and exists(select 1 from private.event_participants ep
         where ep.event_id = old.event_id and ep.used > 0) then
      raise exception 'SEASON_HAS_SELECTIONS';
    end if;
    new.previous_ends_at := old.ends_at;
    new.force_locked := true;
    return new;
  end if;
  if now() >= old.starts_at and not old.purging
     and (new.board_mode is distinct from old.board_mode
          or new.base_selection_allowance is distinct from old.base_selection_allowance) then
    raise exception 'EVENT_RULES_LOCKED';
  end if;
  return new;
end;
$$;

create function private.initialize_season_participants()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.continuous_mode and not old.continuous_mode then
    update private.event_participants ep
       set participation_ends_at = old.ends_at, season_accepted_at = null,
           week_started_at = private.season_week(now()),
           weekly_used = least(ep.used, new.base_selection_allowance),
           bonus_remaining = greatest(ep.allowance - greatest(ep.used, new.base_selection_allowance), 0)
     where ep.event_id = old.event_id;
  end if;
  return new;
end;
$$;
revoke all on function private.initialize_season_participants() from public, anon, authenticated;
create trigger session_config_z_initialize_season
  after update on public.session_config for each row execute function private.initialize_season_participants();

create or replace function private.apply_event_base_allowance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_config public.session_config%rowtype;
begin
  select * into v_config from public.session_config c where c.id=1 and c.event_id=new.event_id;
  if not found then raise exception 'STALE_EVENT'; end if;
  new.allowance := v_config.base_selection_allowance;
  new.participation_ends_at := v_config.ends_at;
  new.week_started_at := private.season_week(now());
  return new;
end;
$$;

create function public.activate_continuous_season(p_ends_at timestamptz, p_board_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_ends_at is null or p_board_mode is null or p_board_mode not in ('opposite','selectable') then
    raise exception 'INVALID_SEASON_TRANSITION';
  end if;
  update public.session_config set continuous_mode=true, ends_at=p_ends_at,
    board_mode=p_board_mode, base_selection_allowance=2, force_locked=true
    where id=1 and not purging and not continuous_mode;
  if not found then raise exception 'SEASON_ALREADY_ACTIVE_OR_PURGING'; end if;
end;
$$;
revoke all on function public.activate_continuous_season(timestamptz,text) from public, anon, authenticated;
grant execute on function public.activate_continuous_season(timestamptz,text) to service_role;

create function public.admin_season_summary()
returns table(accepted int,pending int) language sql stable security definer set search_path = '' as $$
  select count(*) filter(where ep.season_accepted_at is not null)::int,
    count(*) filter(where ep.season_accepted_at is null)::int
    from private.event_participants ep join public.session_config c on c.id=1 and c.event_id=ep.event_id
    where ep.current_user_id is not null
$$;
revoke all on function public.admin_season_summary() from public,anon,authenticated;
grant execute on function public.admin_season_summary() to service_role;

-- Identity/authentication remains usable for reading, editing or deleting one's own
-- card. Cross-participant access additionally requires explicit season consent.
create function private.season_participant_ready(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select not c.continuous_mode or
    (ep.season_accepted_at is not null and ep.participation_ends_at >= c.ends_at)
    from public.session_config c join private.event_participants ep
      on ep.event_id=c.event_id and ep.current_user_id=p_user_id
    where c.id=1 and not c.purging), false)
$$;
revoke all on function private.season_participant_ready(uuid) from public, anon, authenticated;

create function public.my_season_state()
returns table(event_id uuid, continuous_mode boolean, ends_at timestamptz,
  participation_ends_at timestamptz, accepted boolean, board_mode text, base_allowance integer)
language sql stable security definer set search_path = '' as $$
  select c.event_id,c.continuous_mode,c.ends_at,ep.participation_ends_at,
    private.season_participant_ready(auth.uid()),c.board_mode,c.base_selection_allowance
    from public.session_config c join private.event_participants ep
      on ep.event_id=c.event_id and ep.current_user_id=auth.uid()
    where c.id=1 and private.app_actor_active()
$$;
revoke all on function public.my_season_state() from public, anon;
grant execute on function public.my_season_state() to authenticated;

create function public.accept_current_season(p_event_id uuid,p_ends_at timestamptz,p_board_mode text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_config public.session_config%rowtype;
begin
  if not private.app_actor_active() then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;
  select * into v_config from public.session_config where id=1 for share;
  if not v_config.continuous_mode or v_config.purging or now() >= v_config.ends_at then
    raise exception 'SEASON_UNAVAILABLE';
  end if;
  if p_event_id is distinct from v_config.event_id or p_ends_at is distinct from v_config.ends_at
     or p_board_mode is distinct from v_config.board_mode then raise exception 'SEASON_CHANGED'; end if;
  update private.event_participants set season_accepted_at=coalesce(season_accepted_at,now()),
    participation_ends_at=v_config.ends_at
    where event_id=v_config.event_id and current_user_id=auth.uid() and not banned;
  if not found then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;
  update public.users set terms_accepted_at=now(),privacy_accepted_at=now(),last_active_at=now()
    where id=auth.uid();
end;
$$;
revoke all on function public.accept_current_season(uuid,timestamptz,text) from public, anon;
grant execute on function public.accept_current_season(uuid,timestamptz,text) to authenticated;

-- Cumulative used never resets: selection numbers and administrator totals stay intact.
-- The private clock parameter permits deterministic isolated tests, never a client override.
create function private.refresh_season_slots(p_user_id uuid default null,p_now timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare v_config public.session_config%rowtype; v_week timestamptz; v_row record;
begin
  select * into v_config from public.session_config where id=1 for share;
  if not v_config.continuous_mode or v_config.purging
     or p_now < v_config.starts_at or p_now >= v_config.ends_at then return; end if;
  v_week := private.season_week(p_now);
  for v_row in select ep.subject_key from private.event_participants ep
    where ep.event_id=v_config.event_id and (p_user_id is null or ep.current_user_id=p_user_id)
      and (ep.week_started_at is null or ep.week_started_at < v_week)
    order by ep.subject_key for update
  loop
    update private.event_participants set weekly_used=0,week_started_at=v_week,
      allowance=used+v_config.base_selection_allowance+bonus_remaining
      where event_id=v_config.event_id and subject_key=v_row.subject_key;
  end loop;
end;
$$;
revoke all on function private.refresh_season_slots(uuid,timestamptz) from public, anon, authenticated;

create or replace function public.board_is_open()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select not c.purging and not c.force_locked and c.starts_at<=now() and c.ends_at>now()
    and (c.continuous_mode or ((select male from public.gender_counts())>=c.threshold_male
      and (select female from public.gender_counts())>=c.threshold_female))
    from public.session_config c where c.id=1),false)
$$;

create or replace function public.gender_counts()
returns table(male int,female int) language sql stable security definer set search_path = '' as $$
  select count(*) filter(where u.gender='M')::int,count(*) filter(where u.gender='F')::int
    from public.cards card join public.users u on u.id=card.user_id
    join auth.users a on a.id=u.id
    join public.session_config c on c.id=1 and not c.purging
    join private.event_participants ep on ep.event_id=c.event_id and ep.current_user_id=u.id
    where not card.hidden_by_user and not card.hidden_by_admin and not u.banned and not ep.banned
      and u.gender is not null and a.email_confirmed_at is not null
      and lower(a.email)=lower(u.email) and lower(a.email) ~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
      and private.season_participant_ready(u.id)
$$;

create or replace function public.board_cards(p_target_gender text default null)
returns table(id uuid,one_liner text,color text,gender text)
language plpgsql stable security definer set search_path = '' as $$
declare v_gender text; v_mode text; v_target text;
begin
  if not private.app_actor_active() then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;
  if not public.board_is_open() then raise exception 'BOARD_CLOSED'; end if;
  if not private.season_participant_ready(auth.uid()) then raise exception 'SEASON_CONSENT_REQUIRED'; end if;
  select u.gender into v_gender from public.users u where u.id=auth.uid();
  select c.board_mode into v_mode from public.session_config c where c.id=1;
  if v_mode='opposite' then v_target := case when v_gender='M' then 'F' else 'M' end;
  else
    if p_target_gender is null or p_target_gender not in ('M','F') then raise exception 'INVALID_TARGET_GENDER'; end if;
    v_target := p_target_gender;
  end if;
  return query select card.id,card.one_liner,card.color,u.gender
    from public.cards card join public.users u on u.id=card.user_id
    where card.user_id<>auth.uid() and u.gender=v_target
      and not card.hidden_by_user and not card.hidden_by_admin
      and private.gender_of(card.user_id) is not null
      and private.season_participant_ready(card.user_id)
      and not exists(select 1 from public.matches m where m.viewer_user_id=auth.uid() and m.viewed_card_id=card.id)
      and not private.card_is_full(card.id);
end;
$$;

create or replace function public.consume_slot_and_reveal(target_card_id uuid)
returns table(instagram_id text,contact_type text)
language plpgsql security definer set search_path = '' as $$
declare v_config public.session_config%rowtype; viewer uuid:=auth.uid(); viewer_gender text;
  target_user uuid; target_gender text; target_hidden boolean; v_viewer private.event_participants%rowtype;
  v_target private.event_participants%rowtype; v_bonus boolean;
begin
  if not private.app_actor_active() then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;
  select * into v_config from public.session_config where id=1 for share;
  if v_config.purging then raise exception 'PURGE_IN_PROGRESS'; end if;
  if not public.board_is_open() then raise exception 'BOARD_CLOSED'; end if;
  if not private.season_participant_ready(viewer) then raise exception 'SEASON_CONSENT_REQUIRED'; end if;
  select u.gender into viewer_gender from public.users u where u.id=viewer;
  if viewer_gender is null then raise exception 'ONBOARDING_INCOMPLETE'; end if;
  if not exists(select 1 from public.cards c where c.user_id=viewer) then raise exception 'NO_CARD'; end if;
  select c.user_id,(c.hidden_by_user or c.hidden_by_admin) into target_user,target_hidden
    from public.cards c where c.id=target_card_id for update;
  if target_user is null then raise exception 'CARD_NOT_FOUND'; end if;
  if target_user=viewer then raise exception 'CANNOT_VIEW_OWN_CARD'; end if;
  target_gender:=private.gender_of(target_user);
  if target_hidden or target_gender is null or not private.season_participant_ready(target_user) then
    raise exception 'CARD_HIDDEN';
  end if;
  if v_config.board_mode='opposite' and target_gender=viewer_gender then raise exception 'SAME_GENDER'; end if;
  perform 1 from private.event_participants ep where ep.event_id=v_config.event_id
    and ep.current_user_id in (viewer,target_user) order by ep.subject_key for update;
  perform private.refresh_season_slots(viewer);
  select * into v_viewer from private.event_participants ep where ep.event_id=v_config.event_id and ep.current_user_id=viewer;
  select * into v_target from private.event_participants ep where ep.event_id=v_config.event_id and ep.current_user_id=target_user;
  if v_viewer.banned then raise exception 'BANNED'; end if;
  if v_target.banned then raise exception 'CARD_HIDDEN'; end if;
  if v_viewer.allowance is null or v_viewer.used>=v_viewer.allowance then raise exception 'SLOT_ALREADY_USED'; end if;
  if v_target.received_reveals is null then raise exception 'CARD_NOT_FOUND'; end if;
  if v_config.max_views_per_card is not null and v_target.received_reveals>=v_config.max_views_per_card then raise exception 'CARD_FULL'; end if;
  v_bonus:=case when v_config.continuous_mode then v_viewer.weekly_used>=v_config.base_selection_allowance
    else v_viewer.used>=v_config.base_selection_allowance end;
  insert into public.matches(viewer_user_id,viewed_card_id,bonus,selection_number)
    values(viewer,target_card_id,v_bonus,v_viewer.used+1);
  update private.event_participants set used=used+1,
    weekly_used=weekly_used+case when v_config.continuous_mode and not v_bonus then 1 else 0 end,
    bonus_remaining=bonus_remaining-case when v_config.continuous_mode and v_bonus then 1 else 0 end
    where event_id=v_config.event_id and current_user_id=viewer;
  update private.event_participants set received_reveals=received_reveals+1
    where event_id=v_config.event_id and current_user_id=target_user;
  return query select c.instagram_id,c.contact_type from public.cards c where c.id=target_card_id;
exception when unique_violation then raise exception 'CARD_ALREADY_VIEWED';
end;
$$;

drop function public.my_slot_state();
create function public.my_slot_state()
returns table(allowance int,used int,remaining int,base_remaining int,bonus_remaining int,next_refill_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.app_actor_active() then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;
  perform private.refresh_season_slots(auth.uid());
  return query select ep.allowance,ep.used,greatest(ep.allowance-ep.used,0),
    case when c.continuous_mode then greatest(c.base_selection_allowance-ep.weekly_used,0)
      else greatest(c.base_selection_allowance-ep.used,0) end,
    case when c.continuous_mode then ep.bonus_remaining else greatest(ep.allowance-greatest(c.base_selection_allowance,ep.used),0) end,
    case when c.continuous_mode and private.season_week(now())+interval '7 days'<c.ends_at
      then private.season_week(now())+interval '7 days' else null end
    from private.event_participants ep join public.session_config c on c.id=1 and c.event_id=ep.event_id
    where ep.current_user_id=auth.uid();
end;
$$;
revoke all on function public.my_slot_state() from public, anon;
grant execute on function public.my_slot_state() to authenticated;

create or replace function public.admin_event_participant_state(p_user_id uuid)
returns table(allowance int,used int,remaining int,received_reveals int,banned boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_season_slots(p_user_id);
  return query select ep.allowance,ep.used,greatest(ep.allowance-ep.used,0),ep.received_reveals,ep.banned
    from private.event_participants ep join public.session_config c on c.id=1 and c.event_id=ep.event_id
    where ep.current_user_id=p_user_id;
end;
$$;

create or replace function public.grant_event_slot(p_user_id uuid)
returns table(allowance int,used int,remaining int)
language plpgsql security definer set search_path = '' as $$
declare v_config public.session_config%rowtype;
begin
  select * into v_config from public.session_config where id=1 for share;
  if v_config.purging then raise exception 'PURGE_IN_PROGRESS'; end if;
  perform private.refresh_season_slots(p_user_id);
  update private.event_participants ep set allowance=ep.allowance+1,
    bonus_remaining=ep.bonus_remaining+case when v_config.continuous_mode then 1 else 0 end
    where ep.event_id=v_config.event_id and ep.current_user_id=p_user_id and ep.used>=ep.allowance;
  if not exists(select 1 from private.event_participants ep where ep.event_id=v_config.event_id and ep.current_user_id=p_user_id)
    then raise exception 'PARTICIPANT_NOT_FOUND'; end if;
  return query select ep.allowance,ep.used,greatest(ep.allowance-ep.used,0)
    from private.event_participants ep where ep.event_id=v_config.event_id and ep.current_user_id=p_user_id;
end;
$$;
revoke all on function public.admin_event_participant_state(uuid) from public,anon,authenticated;
grant execute on function public.admin_event_participant_state(uuid) to service_role;
revoke all on function public.grant_event_slot(uuid) from public,anon,authenticated;
grant execute on function public.grant_event_slot(uuid) to service_role;

create or replace function public.my_matches()
returns table(match_id uuid,card_id uuid,one_liner text,color text,instagram_id text,
  contact_type text,bonus boolean,selection_number integer,created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id,c.id,c.one_liner,c.color,c.instagram_id,c.contact_type,m.bonus,m.selection_number,m.created_at
    from public.matches m join public.cards c on c.id=m.viewed_card_id
    join public.session_config s on s.id=1
    where private.app_actor_active() and m.viewer_user_id=auth.uid() and not s.purging
      and now()>=s.starts_at and now()<s.ends_at and private.season_participant_ready(auth.uid())
    order by m.selection_number desc
$$;

-- The existing minute job keeps functioning. Refills are also checked on reads
-- and selections, so a delayed job cannot double-grant or strand an active user.
create or replace function public.session_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare v_config public.session_config%rowtype; v_row record;
begin
  delete from public.magic_link_throttle where window_start<now()-interval '2 hours';
  delete from public.permanent_bans where expires_at<=now();
  select * into v_config from public.session_config where id=1 for share;
  if v_config.purging then return; end if;
  perform private.refresh_season_slots();
  if v_config.continuous_mode then
    -- Keep the previous deletion deadline for participants who never opt in.
    for v_row in select ep.subject_key,ep.current_user_id from private.event_participants ep
      where ep.event_id=v_config.event_id and ep.season_accepted_at is null
        and ep.participation_ends_at+interval '7 days'<=now()
      order by ep.subject_key for update
    loop
      delete from public.matches where viewer_user_id=v_row.current_user_id;
      delete from public.cards where user_id=v_row.current_user_id;
      delete from private.event_participants where event_id=v_config.event_id and subject_key=v_row.subject_key;
    end loop;
  end if;
end;
$$;
revoke all on function public.session_tick() from public, anon, authenticated;
notify pgrst,'reload schema';
