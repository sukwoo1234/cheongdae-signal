-- Apply after 0027_continuous_seasons.sql. Keep the season consent and weekly
-- selection rules while closing direct Data API access for ineligible sessions.

create or replace function private.app_actor_active()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and public.is_magic_link_session()
     and exists (
       select 1
         from public.users u
         join auth.users a on a.id = u.id
         join auth.sessions s on s.user_id = a.id
         join public.session_config c on c.id = 1 and not c.purging
         join private.event_participants ep
           on ep.event_id = c.event_id and ep.current_user_id = u.id
        where u.id = auth.uid()
          and s.id = case
            when auth.jwt()->>'session_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
            then (auth.jwt()->>'session_id')::uuid
            else null
          end
          and (s.not_after is null or s.not_after > now())
          and not u.banned
          and not ep.banned
          and not exists (
            select 1 from public.permanent_bans pb
             where pb.email = lower(u.email) and pb.expires_at > now()
          )
          and a.email_confirmed_at is not null
          and lower(a.email) = lower(u.email)
          and lower(a.email) ~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
     )
$$;

revoke all on function private.app_actor_active() from public, anon, authenticated;
grant execute on function private.app_actor_active() to authenticated;

drop policy if exists session_config_read on public.session_config;
create policy session_config_read on public.session_config
  for select to authenticated using (private.app_actor_active());

-- Service-role calls are used by administration. PostgREST sets the actual
-- database role; a JWT claim or user metadata must not bypass this gate.
create or replace function public.gender_counts()
returns table(male int, female int)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if current_setting('role', true) is distinct from 'service_role'
     and not private.app_actor_active() then
    raise exception 'ACCOUNT_NOT_ALLOWED';
  end if;

  return query
  select count(*) filter(where u.gender = 'M')::int,
         count(*) filter(where u.gender = 'F')::int
    from public.cards card
    join public.users u on u.id = card.user_id
    join auth.users a on a.id = u.id
    join public.session_config c on c.id = 1 and not c.purging
    join private.event_participants ep
      on ep.event_id = c.event_id and ep.current_user_id = u.id
   where not card.hidden_by_user and not card.hidden_by_admin
     and not u.banned and not ep.banned
     and u.gender is not null and a.email_confirmed_at is not null
     and lower(a.email) = lower(u.email)
     and lower(a.email) ~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
     and private.season_participant_ready(u.id);
end;
$$;

revoke all on function public.gender_counts() from public, anon, authenticated;
grant execute on function public.gender_counts() to authenticated, service_role;

create or replace function public.board_is_open()
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if current_setting('role', true) is distinct from 'service_role'
     and not private.app_actor_active() then
    raise exception 'ACCOUNT_NOT_ALLOWED';
  end if;

  return coalesce((
    select not c.purging and not c.force_locked
       and c.starts_at <= now() and c.ends_at > now()
       and (c.continuous_mode or (
         (select gc.male from public.gender_counts() gc) >= c.threshold_male
         and (select gc.female from public.gender_counts() gc) >= c.threshold_female
       ))
      from public.session_config c where c.id = 1
  ), false);
end;
$$;

revoke all on function public.board_is_open() from public, anon, authenticated;
grant execute on function public.board_is_open() to authenticated, service_role;

create or replace function public.board_cards(p_target_gender text default null)
returns table(id uuid, one_liner text, color text, gender text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_gender text;
  v_terms_accepted_at timestamptz;
  v_privacy_accepted_at timestamptz;
  v_mode text;
  v_target text;
begin
  if not private.app_actor_active() then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;
  if not public.board_is_open() then raise exception 'BOARD_CLOSED'; end if;
  if not private.season_participant_ready(auth.uid()) then
    raise exception 'SEASON_CONSENT_REQUIRED';
  end if;

  select u.gender, u.terms_accepted_at, u.privacy_accepted_at
    into v_gender, v_terms_accepted_at, v_privacy_accepted_at
    from public.users u where u.id = auth.uid();
  if v_gender is null or v_terms_accepted_at is null or v_privacy_accepted_at is null then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  select c.board_mode into v_mode from public.session_config c where c.id = 1;
  if v_mode = 'opposite' then
    v_target := case when v_gender = 'M' then 'F' else 'M' end;
  else
    if p_target_gender is null or p_target_gender not in ('M', 'F') then
      raise exception 'INVALID_TARGET_GENDER';
    end if;
    v_target := p_target_gender;
  end if;

  return query
  select card.id, card.one_liner, card.color, u.gender
    from public.cards card
    join public.users u on u.id = card.user_id
   where card.user_id <> auth.uid()
     and u.gender = v_target
     and not card.hidden_by_user and not card.hidden_by_admin
     and private.gender_of(card.user_id) is not null
     and private.season_participant_ready(card.user_id)
     and not exists (
       select 1 from public.matches m
        where m.viewer_user_id = auth.uid() and m.viewed_card_id = card.id
     )
     and not private.card_is_full(card.id);
end;
$$;

revoke all on function public.board_cards(text) from public, anon, authenticated;
grant execute on function public.board_cards(text) to authenticated;

-- A retained profile may already have banned=true. The users trigger permits
-- updates to such a row, so enrollment must check the active permanent-ban
-- record itself, under the same advisory lock used by add_permanent_ban().
create or replace function public.register_event_participant(
  p_event_id uuid,
  p_user_id uuid,
  p_email text,
  p_subject_key text
)
returns table(allowance int, used int, remaining int, banned boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_event_id uuid;
  v_purging boolean;
  v_existing_subject text;
  v_row private.event_participants%rowtype;
begin
  if p_user_id is null
     or lower(p_email) !~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
     or p_subject_key !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_PARTICIPANT';
  end if;

  select c.event_id, c.purging into v_event_id, v_purging
    from public.session_config c where c.id = 1 for share;
  if v_purging then raise exception 'PURGE_IN_PROGRESS'; end if;
  if v_event_id is distinct from p_event_id then raise exception 'STALE_EVENT'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(lower(p_email), 0)
  );
  if exists (
    select 1 from public.permanent_bans pb
     where pb.email = lower(p_email) and pb.expires_at > now()
  ) then
    raise exception 'PERMANENTLY_BANNED';
  end if;

  insert into public.users(id, email, last_active_at)
  values (p_user_id, lower(p_email), now())
  on conflict (id) do update
    set email = excluded.email,
        last_active_at = now();

  select ep.subject_key into v_existing_subject
    from private.event_participants ep
   where ep.event_id = v_event_id and ep.current_user_id = p_user_id
   for update;

  if v_existing_subject is not null then
    select * into v_row from private.event_participants ep
     where ep.event_id = v_event_id and ep.subject_key = v_existing_subject;
  else
    insert into private.event_participants(event_id, subject_key, current_user_id)
    values (v_event_id, p_subject_key, p_user_id)
    on conflict (event_id, subject_key) do nothing;

    select * into v_row from private.event_participants ep
     where ep.event_id = v_event_id and ep.subject_key = p_subject_key
     for update;
    if v_row.current_user_id is not null and v_row.current_user_id <> p_user_id then
      raise exception 'PARTICIPANT_ALREADY_LINKED';
    end if;
    update private.event_participants ep set current_user_id = p_user_id
     where ep.event_id = v_event_id and ep.subject_key = p_subject_key
     returning ep.* into v_row;
  end if;

  if v_row.banned then raise exception 'PARTICIPANT_BANNED'; end if;
  return query select v_row.allowance, v_row.used,
    greatest(v_row.allowance - v_row.used, 0), v_row.banned;
end;
$$;

revoke all on function public.register_event_participant(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.register_event_participant(uuid, uuid, text, text)
  to service_role;

-- A retained account can exist without a row in the current event ledger.
-- ban_event_participant() requires that row, so ban the retained profile
-- directly in that case and still write the permanent and event ban records.
create or replace function public.add_permanent_ban(
  p_email text, p_reason text, p_actor uuid
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_user_id uuid;
  v_event_id uuid;
  v_purging boolean;
begin
  if v_email is null or v_email !~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
     or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500
     or p_actor is null then
    raise exception 'INVALID_PERMANENT_BAN';
  end if;

  select c.event_id, c.purging into v_event_id, v_purging
    from public.session_config c where c.id = 1 for share;
  if v_purging then raise exception 'PURGE_IN_PROGRESS'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_email, 0)
  );

  insert into public.permanent_bans(email, reason, created_by)
    values (v_email, btrim(p_reason), p_actor)
    on conflict (email) do update
      set reason = excluded.reason,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at,
          created_by = excluded.created_by
      where public.permanent_bans.expires_at <= now();

  select u.id into v_user_id from public.users u where lower(u.email) = v_email;
  if v_user_id is not null then
    if exists (
      select 1 from private.event_participants ep
       where ep.event_id = v_event_id and ep.current_user_id = v_user_id
    ) then
      perform public.ban_event_participant(v_user_id, 'permanent_ban');
    else
      update public.users
         set banned = true, banned_reason = 'permanent_ban'
       where id = v_user_id;
    end if;
  end if;
  insert into public.banned_emails(email, reason)
    values (v_email, 'permanent_ban')
    on conflict (email) do nothing;
  return v_user_id;
end;
$$;

revoke all on function public.add_permanent_ban(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.add_permanent_ban(text, text, uuid)
  to service_role;

-- Event bans reset across events. Active permanent bans remain active and must
-- not trip users_reject_permanent_ban while the next event is initialized.
create or replace function public.finish_event_purge()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_next_event uuid := gen_random_uuid();
begin
  if exists(select 1 from public.cards)
     or exists(select 1 from public.matches)
     or exists(select 1 from public.banned_emails)
     or exists(select 1 from public.magic_link_throttle)
     or exists(select 1 from private.event_participants) then
    raise exception 'PURGE_INCOMPLETE';
  end if;
  update public.session_config
     set event_id = v_next_event, purging = false, force_locked = true,
         max_views_per_card = null, board_mode = 'opposite', base_selection_allowance = 1
   where id = 1 and purging;
  if not found then raise exception 'PURGE_NOT_STARTED'; end if;

  update public.users u
     set banned = exists (
           select 1 from public.permanent_bans pb
            where pb.email = lower(u.email) and pb.expires_at > now()
         ),
         banned_reason = case when exists (
           select 1 from public.permanent_bans pb
            where pb.email = lower(u.email) and pb.expires_at > now()
         ) then 'permanent_ban' else null end
   where u.id is not null;
  return v_next_event;
end;
$$;

revoke all on function public.finish_event_purge() from public, anon, authenticated;
grant execute on function public.finish_event_purge() to service_role;

notify pgrst, 'reload schema';
