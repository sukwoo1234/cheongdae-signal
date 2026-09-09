-- =============================================================================
-- 0013: 행사별 이용 원장 + DB 권한 경계 + 안전한 폐기
--
-- 사용자/카드/매칭이 삭제돼도 같은 행사에서 사용한 선택 기회와 공개 횟수는
-- 유지한다. 원문 이메일은 저장하지 않고 앱 서버가 만든 행사별 HMAC만 보관한다.
-- 이 마이그레이션은 파일럿 데이터 폐기 후 적용하는 것을 전제로 한다.
-- =============================================================================

do $$
begin
  if exists (select 1 from public.users limit 1) then
    raise exception '0013_REQUIRES_EMPTY_PARTICIPANT_DATA';
  end if;
end;
$$;

alter table public.session_config
  add column if not exists event_id uuid default gen_random_uuid(),
  add column if not exists purging boolean not null default false;

update public.session_config set event_id = gen_random_uuid() where event_id is null;
alter table public.session_config alter column event_id set not null;
alter table public.session_config alter column event_id set default gen_random_uuid();

-- 처리방침의 "한 명에게만 공개"와 DB 기본값을 일치시킨다.
update public.session_config set max_views_per_card = 1 where max_views_per_card is null;
alter table public.session_config alter column max_views_per_card set default 1;
alter table public.session_config alter column max_views_per_card set not null;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table private.event_participants (
  event_id uuid not null,
  subject_key text not null check (subject_key ~ '^[0-9a-f]{64}$'),
  current_user_id uuid references public.users(id) on delete set null,
  allowance integer not null default 1 check (allowance >= 0),
  used integer not null default 0 check (used >= 0 and used <= allowance),
  received_reveals integer not null default 0 check (received_reveals >= 0),
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, subject_key)
);

create unique index event_participants_current_user_idx
  on private.event_participants (event_id, current_user_id)
  where current_user_id is not null;

revoke all on private.event_participants from public, anon, authenticated;

create trigger event_participants_touch_updated_at
  before update on private.event_participants
  for each row execute function public.touch_updated_at();

-- 참가자 테이블 쓰기는 session_config 행을 공유 잠금한다. 폐기 시작은 같은 행의
-- 배타 잠금을 얻어 진행 중인 쓰기가 끝날 때까지 기다리고, 이후 쓰기는 거부한다.
create or replace function private.assert_event_writable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purging boolean;
begin
  select c.purging into v_purging
    from public.session_config c where c.id = 1 for share;
  if coalesce(v_purging, true) then
    raise exception 'PURGE_IN_PROGRESS';
  end if;
  return new;
end;
$$;

revoke all on function private.assert_event_writable() from public, anon, authenticated;

create trigger users_event_writable
  before insert or update on public.users
  for each row execute function private.assert_event_writable();
create trigger cards_event_writable
  before insert or update on public.cards
  for each row execute function private.assert_event_writable();
create trigger matches_event_writable
  before insert or update on public.matches
  for each row execute function private.assert_event_writable();

-- 현재 JWT가 실제 확정된 학교 계정, 활성 프로필, 현재 행사 원장에 모두
-- 연결돼 있는지 한 곳에서 판정한다. 차단은 access token 만료를 기다리지 않는다.
create or replace function private.app_actor_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.is_magic_link_session()
     and exists (
       select 1
         from public.users u
         join auth.users a on a.id = u.id
         join public.session_config c on c.id = 1 and not c.purging
         join private.event_participants ep
           on ep.event_id = c.event_id and ep.current_user_id = u.id
        where u.id = auth.uid()
          and not u.banned
          and not ep.banned
          and a.email_confirmed_at is not null
          and lower(a.email) = lower(u.email)
          and lower(a.email) ~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
     )
$$;

revoke all on function private.app_actor_active() from public, anon, authenticated;
grant execute on function private.app_actor_active() to authenticated;

create or replace function private.gender_of(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.gender
    from public.users u
    join auth.users a on a.id = u.id
    join public.session_config c on c.id = 1 and not c.purging
    join private.event_participants ep
      on ep.event_id = c.event_id and ep.current_user_id = u.id
   where u.id = uid
     and not u.banned
     and not ep.banned
     and a.email_confirmed_at is not null
     and lower(a.email) = lower(u.email)
     and lower(a.email) ~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
$$;

revoke all on function private.gender_of(uuid) from public, anon, authenticated;
grant execute on function private.gender_of(uuid) to authenticated;

create or replace function private.card_is_full(p_card_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select ep.received_reveals >= c.max_views_per_card
      from public.cards card
      join public.session_config c on c.id = 1
      join private.event_participants ep
        on ep.event_id = c.event_id and ep.current_user_id = card.user_id
     where card.id = p_card_id
  ), true)
$$;

revoke all on function private.card_is_full(uuid) from public, anon, authenticated;
grant execute on function private.card_is_full(uuid) to authenticated;

-- 공개 집계와 보드 판정도 현재 행사에 정상 연결된 참가자만 센다.
create or replace function public.gender_counts()
returns table(male int, female int)
language sql
security definer
stable
set search_path = ''
as $$
  select
    count(*) filter (where u.gender = 'M')::int,
    count(*) filter (where u.gender = 'F')::int
  from public.users u
  join auth.users a on a.id = u.id
  join public.session_config c on c.id = 1 and not c.purging
  join private.event_participants ep
    on ep.event_id = c.event_id and ep.current_user_id = u.id
  where not u.banned and not ep.banned
    and u.gender is not null
    and a.email_confirmed_at is not null
    and lower(a.email) = lower(u.email)
    and lower(a.email) ~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
$$;

create or replace function public.board_is_open()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((
    select not c.purging
       and not c.force_locked
       and c.starts_at <= now()
       and c.ends_at > now()
       and (select gc.male from public.gender_counts() gc) >= c.threshold_male
       and (select gc.female from public.gender_counts() gc) >= c.threshold_female
      from public.session_config c where c.id = 1
  ), false)
$$;

-- 이전 permissive 정책을 모두 현재 actor 경계로 교체한다.
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select to authenticated
  using (auth.uid() = id and private.app_actor_active());

drop policy if exists cards_self_all on public.cards;
create policy cards_self_all on public.cards
  for all to authenticated
  using (auth.uid() = user_id and private.app_actor_active())
  with check (auth.uid() = user_id and private.app_actor_active());

drop policy if exists cards_opposite_gender_select on public.cards;
create policy cards_opposite_gender_select on public.cards
  for select to authenticated using (
    private.app_actor_active()
    and auth.uid() <> user_id
    and not hidden_by_user
    and not hidden_by_admin
    and private.gender_of(auth.uid()) is not null
    and private.gender_of(user_id) is not null
    and private.gender_of(auth.uid()) <> private.gender_of(user_id)
    and not exists (
      select 1 from public.matches m
       where m.viewer_user_id = auth.uid() and m.viewed_card_id = cards.id
    )
    and not private.card_is_full(cards.id)
    and public.board_is_open()
  );

drop policy if exists matches_self_select on public.matches;
create policy matches_self_select on public.matches
  for select to authenticated
  using (auth.uid() = viewer_user_id and private.app_actor_active());

-- 콘텐츠 필터는 TypeScript 서버에서 한 번만 유지한다. 브라우저가 REST로
-- 직접 우회하지 못하게 cards의 쓰기 권한을 회수한다.
revoke insert, update on public.cards from authenticated;
revoke insert (user_id, one_liner, instagram_id, color) on public.cards from authenticated;
revoke update (one_liner, instagram_id, color, hidden_by_user) on public.cards from authenticated;

create or replace function public.register_event_participant(
  p_event_id uuid,
  p_user_id uuid,
  p_email text,
  p_subject_key text
)
returns table(allowance int, used int, remaining int, banned boolean)
language plpgsql
security definer
set search_path = ''
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

  insert into public.users(id, email)
  values (p_user_id, lower(p_email))
  on conflict (id) do update set email = excluded.email;

  -- 같은 Auth UUID의 행사 원장이 이미 있으면 이메일 변경으로 새 슬롯을 만들지 않는다.
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

create or replace function public.complete_onboarding(
  p_gender text,
  p_terms_accepted boolean,
  p_privacy_accepted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.app_actor_active() then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;
  if p_gender not in ('M', 'F') then raise exception 'INVALID_GENDER'; end if;
  if p_terms_accepted is not true or p_privacy_accepted is not true then
    raise exception 'CONSENT_REQUIRED';
  end if;

  update public.users
     set gender = p_gender,
         terms_accepted_at = coalesce(terms_accepted_at, now()),
         privacy_accepted_at = coalesce(privacy_accepted_at, now())
   where id = auth.uid() and gender is null;
  if not found then raise exception 'GENDER_ALREADY_SET'; end if;
end;
$$;

create or replace function public.my_card()
returns table(
  id uuid, one_liner text, instagram_id text, color text,
  hidden_by_user boolean, hidden_by_admin boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select c.id, c.one_liner, c.instagram_id, c.color,
         c.hidden_by_user, c.hidden_by_admin
    from public.cards c
   where private.app_actor_active() and c.user_id = auth.uid()
$$;

create or replace function public.my_matches()
returns table(
  match_id uuid, card_id uuid, one_liner text, color text,
  instagram_id text, bonus boolean, created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select m.id, c.id, c.one_liner, c.color, c.instagram_id, m.bonus, m.created_at
    from public.matches m
    join public.cards c on c.id = m.viewed_card_id
   where private.app_actor_active() and m.viewer_user_id = auth.uid()
   order by m.created_at desc
$$;

create or replace function public.my_slot_state()
returns table(allowance int, used int, remaining int)
language sql
security definer
stable
set search_path = ''
as $$
  select ep.allowance, ep.used, greatest(ep.allowance - ep.used, 0)::int
    from private.event_participants ep
    join public.session_config c on c.id = 1 and c.event_id = ep.event_id
   where private.app_actor_active() and ep.current_user_id = auth.uid()
$$;

revoke all on function public.my_slot_state() from public, anon;
grant execute on function public.my_slot_state() to authenticated;

create or replace function public.consume_slot_and_reveal(target_card_id uuid)
returns table(instagram_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  v_event_id uuid;
  v_purging boolean;
  v_max_views int;
  viewer_gender text;
  target_user uuid;
  target_gender text;
  target_hidden boolean;
  viewer_allowance int;
  viewer_used int;
  viewer_banned boolean;
  target_received int;
  target_banned boolean;
begin
  if not private.app_actor_active() then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;

  select c.event_id, c.purging, c.max_views_per_card
    into v_event_id, v_purging, v_max_views
    from public.session_config c where c.id = 1 for share;
  if v_purging then raise exception 'PURGE_IN_PROGRESS'; end if;
  if not public.board_is_open() then raise exception 'BOARD_CLOSED'; end if;

  select u.gender into viewer_gender from public.users u where u.id = viewer;
  if viewer_gender is null then raise exception 'ONBOARDING_INCOMPLETE'; end if;
  if not exists(select 1 from public.cards c where c.user_id = viewer) then
    raise exception 'NO_CARD';
  end if;

  perform 1 from public.cards c where c.id = target_card_id for update;
  select c.user_id, (c.hidden_by_user or c.hidden_by_admin)
    into target_user, target_hidden from public.cards c where c.id = target_card_id;
  if target_user is null then raise exception 'CARD_NOT_FOUND'; end if;
  if target_user = viewer then raise exception 'CANNOT_VIEW_OWN_CARD'; end if;
  if target_hidden then raise exception 'CARD_HIDDEN'; end if;

  target_gender := private.gender_of(target_user);
  if target_gender is null then raise exception 'CARD_HIDDEN'; end if;
  if target_gender = viewer_gender then raise exception 'SAME_GENDER'; end if;

  -- A→B와 B→A가 동시에 실행돼도 같은 순서로 잠가 deadlock을 피한다.
  perform 1
    from private.event_participants ep
   where ep.event_id = v_event_id
     and ep.current_user_id in (viewer, target_user)
   order by ep.subject_key
   for update;

  select ep.allowance, ep.used, ep.banned
    into viewer_allowance, viewer_used, viewer_banned
    from private.event_participants ep
   where ep.event_id = v_event_id and ep.current_user_id = viewer;
  select ep.received_reveals, ep.banned
    into target_received, target_banned
    from private.event_participants ep
   where ep.event_id = v_event_id and ep.current_user_id = target_user;

  if viewer_banned then raise exception 'BANNED'; end if;
  if target_banned then raise exception 'CARD_HIDDEN'; end if;
  if viewer_allowance is null or viewer_used >= viewer_allowance then
    raise exception 'SLOT_ALREADY_USED';
  end if;
  if target_received is null then raise exception 'CARD_NOT_FOUND'; end if;
  if target_received >= v_max_views then raise exception 'CARD_FULL'; end if;

  insert into public.matches(viewer_user_id, viewed_card_id, bonus)
  values (viewer, target_card_id, viewer_used >= 1);

  update private.event_participants ep set used = used + 1
   where ep.event_id = v_event_id and ep.current_user_id = viewer;
  update private.event_participants ep set received_reveals = received_reveals + 1
   where ep.event_id = v_event_id and ep.current_user_id = target_user;

  return query select c.instagram_id from public.cards c where c.id = target_card_id;
exception
  when unique_violation then raise exception 'CARD_ALREADY_VIEWED';
end;
$$;

revoke all on function public.consume_slot_and_reveal(uuid) from public, anon;
grant execute on function public.consume_slot_and_reveal(uuid) to authenticated;

create or replace function public.admin_event_participant_state(p_user_id uuid)
returns table(allowance int, used int, remaining int, received_reveals int, banned boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select ep.allowance, ep.used, greatest(ep.allowance - ep.used, 0)::int,
         ep.received_reveals, ep.banned
    from private.event_participants ep
    join public.session_config c on c.id = 1 and c.event_id = ep.event_id
   where ep.current_user_id = p_user_id
$$;

revoke all on function public.admin_event_participant_state(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_event_participant_state(uuid) to service_role;

create or replace function public.grant_event_slot(p_user_id uuid)
returns table(allowance int, used int, remaining int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_purging boolean;
begin
  select c.event_id, c.purging into v_event_id, v_purging
    from public.session_config c where c.id = 1 for share;
  if v_purging then raise exception 'PURGE_IN_PROGRESS'; end if;

  update private.event_participants ep
     set allowance = ep.allowance + 1
   where ep.event_id = v_event_id
     and ep.current_user_id = p_user_id
     and ep.used >= ep.allowance;

  if not exists (
    select 1 from private.event_participants ep
     where ep.event_id = v_event_id and ep.current_user_id = p_user_id
  ) then raise exception 'PARTICIPANT_NOT_FOUND'; end if;

  return query
    select ep.allowance, ep.used, greatest(ep.allowance - ep.used, 0)::int
      from private.event_participants ep
     where ep.event_id = v_event_id and ep.current_user_id = p_user_id;
end;
$$;

revoke all on function public.grant_event_slot(uuid) from public, anon, authenticated;
grant execute on function public.grant_event_slot(uuid) to service_role;

create or replace function public.ban_event_participant(
  p_user_id uuid,
  p_reason text default 'admin_ban'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_email text;
begin
  select c.event_id into v_event_id from public.session_config c where c.id = 1 for share;
  select u.email into v_email from public.users u where u.id = p_user_id for update;
  if v_email is null then raise exception 'PARTICIPANT_NOT_FOUND'; end if;

  update private.event_participants ep set banned = true
   where ep.event_id = v_event_id and ep.current_user_id = p_user_id;
  if not found then raise exception 'PARTICIPANT_NOT_FOUND'; end if;

  update public.users u
     set banned = true, banned_reason = coalesce(nullif(p_reason, ''), 'admin_ban')
   where u.id = p_user_id;
  insert into public.banned_emails(email, reason)
    values (lower(v_email), coalesce(nullif(p_reason, ''), 'admin_ban'))
    on conflict (email) do update
      set reason = excluded.reason, banned_at = now();
  update public.cards c set hidden_by_admin = true where c.user_id = p_user_id;
end;
$$;

revoke all on function public.ban_event_participant(uuid, text) from public, anon, authenticated;
grant execute on function public.ban_event_participant(uuid, text) to service_role;

create or replace function public.event_purge_status()
returns table(matches int, cards int, users int, banned_emails int, throttles int, participants int)
language sql
security definer
stable
set search_path = ''
as $$
  select
    (select count(*)::int from public.matches),
    (select count(*)::int from public.cards),
    (select count(*)::int from public.users),
    (select count(*)::int from public.banned_emails),
    (select count(*)::int from public.magic_link_throttle),
    (select count(*)::int from private.event_participants)
$$;

revoke all on function public.event_purge_status() from public, anon, authenticated;
grant execute on function public.event_purge_status() to service_role;

create or replace function public.begin_event_purge()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.session_config set purging = true, force_locked = true where id = 1;
end;
$$;

revoke all on function public.begin_event_purge() from public, anon, authenticated;
grant execute on function public.begin_event_purge() to service_role;

create or replace function public.purge_current_event_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select c.purging from public.session_config c where c.id = 1), false) then
    raise exception 'PURGE_NOT_STARTED';
  end if;
  delete from public.matches;
  delete from public.cards;
  delete from public.users;
  delete from public.banned_emails;
  delete from public.magic_link_throttle;
  delete from private.event_participants;
end;
$$;

revoke all on function public.purge_current_event_data() from public, anon, authenticated;
grant execute on function public.purge_current_event_data() to service_role;

create or replace function public.finish_event_purge()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_event uuid := gen_random_uuid();
begin
  if exists(select 1 from public.users)
     or exists(select 1 from public.cards)
     or exists(select 1 from public.matches)
     or exists(select 1 from public.banned_emails)
     or exists(select 1 from public.magic_link_throttle)
     or exists(select 1 from private.event_participants) then
    raise exception 'PURGE_INCOMPLETE';
  end if;
  update public.session_config
     set event_id = v_next_event, purging = false, force_locked = true,
         max_views_per_card = 1
   where id = 1 and purging;
  if not found then raise exception 'PURGE_NOT_STARTED'; end if;
  return v_next_event;
end;
$$;

revoke all on function public.finish_event_purge() from public, anon, authenticated;
grant execute on function public.finish_event_purge() to service_role;

-- 이전 공개 헬퍼 이름은 Data API에서 제거한다. 정책은 private 함수로 교체됐다.
drop function if exists public.gender_of(uuid);
drop function if exists public.card_is_full(uuid);

notify pgrst, 'reload schema';
