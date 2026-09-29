-- =============================================================================
-- 0024: 회차 간 학교 인증 계정 유지
--
-- 카드·연락처·매칭·행사 원장은 회차가 끝날 때 계속 파기한다.
-- 반면 보유에 동의한 학교 인증 계정과 성별은 마지막 참여일로부터
-- 최대 6개월 유지해 다음 회차에서 이메일 재인증을 반복하지 않게 한다.
-- 실제 Auth 계정 삭제는 service_role Auth API가 필요하므로 행사 폐기
-- 라우트가 retention_accepted_at/last_active_at을 기준으로 처리한다.
-- =============================================================================

alter table public.users
  add column if not exists last_active_at timestamptz not null default now(),
  add column if not exists retention_accepted_at timestamptz;

create index if not exists users_last_active_at_idx
  on public.users(last_active_at);

-- 새 계정을 현재 행사에 등록하거나 이미 참여 중인 계정을 복구할 때
-- 마지막 활성 시각도 같이 갱신한다.
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

-- 이전 회차의 인증 계정을 현재 회차 원장에 다시 연결한다.
-- 보유 동의가 아직 없는 기존 계정은 명시적 동의 없이 연결하지 않는다.
create or replace function public.rejoin_event_participant(
  p_event_id uuid,
  p_user_id uuid,
  p_email text,
  p_subject_key text,
  p_retention_accepted boolean default false
)
returns table(allowance int, used int, remaining int, banned boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_retention_accepted_at timestamptz;
begin
  select lower(u.email), u.retention_accepted_at
    into v_email, v_retention_accepted_at
    from public.users u
   where u.id = p_user_id
   for update;

  if v_email is null or v_email <> lower(p_email) then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;
  if v_retention_accepted_at is null and p_retention_accepted is not true then
    raise exception 'RETENTION_CONSENT_REQUIRED';
  end if;

  update public.users
     set retention_accepted_at = coalesce(retention_accepted_at, now()),
         last_active_at = now()
   where id = p_user_id;

  return query
    select r.allowance, r.used, r.remaining, r.banned
      from public.register_event_participant(
        p_event_id, p_user_id, lower(p_email), p_subject_key
      ) r;
end;
$$;

revoke all on function public.rejoin_event_participant(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.rejoin_event_participant(uuid, uuid, text, text, boolean)
  to service_role;

-- 신규 이용자는 수정된 처리방침에 동의하는 최초 온보딩 시점에
-- 계정 보유 동의도 같이 기록한다.
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
     set gender = coalesce(gender, p_gender),
         terms_accepted_at = coalesce(terms_accepted_at, now()),
         privacy_accepted_at = coalesce(privacy_accepted_at, now()),
         retention_accepted_at = coalesce(retention_accepted_at, now()),
         last_active_at = now()
   where id = auth.uid()
     and (gender is null or gender = p_gender);

  if not found then raise exception 'GENDER_ALREADY_SET'; end if;
end;
$$;

revoke all on function public.complete_onboarding(text, boolean, boolean)
  from public, anon;
grant execute on function public.complete_onboarding(text, boolean, boolean)
  to authenticated;

-- 회차 폐기는 행사 내용과 원장만 지우고 보유 동의한 계정은 남긴다.
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

  delete from public.matches where id is not null;
  delete from public.cards where id is not null;
  delete from public.banned_emails where email is not null;
  delete from public.magic_link_throttle where key_hash is not null;
  delete from private.event_participants
   where event_id is not null and subject_key is not null;
end;
$$;

revoke all on function public.purge_current_event_data() from public, anon, authenticated;
grant execute on function public.purge_current_event_data() to service_role;

-- users는 계정 저장소이므로 회차 폐기 완료 조건에서 제외한다.
create or replace function public.finish_event_purge()
returns uuid
language plpgsql
security definer
set search_path = ''
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
  -- users.banned는 이번 행사 차단 상태다. 6개월 차단은 permanent_bans에
  -- 별도로 남으므로 새 회차를 열 때 이 플래그는 초기화한다.
  update public.users set banned = false, banned_reason = null where id is not null;
  return v_next_event;
end;
$$;

revoke all on function public.finish_event_purge() from public, anon, authenticated;
grant execute on function public.finish_event_purge() to service_role;

notify pgrst, 'reload schema';
