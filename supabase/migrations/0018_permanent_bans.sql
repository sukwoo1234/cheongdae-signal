-- 행사 데이터와 별개로 보관하는 6개월 이메일 차단 목록.
-- 만료/수동 해제 시 이 행은 삭제되지만 기존 행사 차단은 자동으로 해제하지 않는다.
create table public.permanent_bans (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@cju[.]ac[.]kr$'),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 months'),
  created_by uuid not null
);

alter table public.permanent_bans enable row level security;
revoke all on public.permanent_bans from public, anon, authenticated;
grant select, insert, delete on public.permanent_bans to service_role;

-- 로그인 콜백과 차단 조치가 경합해도 새 활성 프로필이 생기지 않게 한다.
create or replace function private.reject_permanently_banned_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(new.email), 0));
  if not new.banned and exists (
    select 1 from public.permanent_bans b
     where b.email = lower(new.email) and b.expires_at > now()
  ) then
    raise exception 'PERMANENTLY_BANNED';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_permanently_banned_profile() from public, anon, authenticated;

create trigger users_reject_permanent_ban
  before insert or update on public.users
  for each row execute function private.reject_permanently_banned_profile();

create or replace function public.add_permanent_ban(
  p_email text, p_reason text, p_actor uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
  v_user_id uuid;
begin
  if v_email is null or v_email !~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
     or char_length(btrim(p_reason)) not between 1 and 500 or p_actor is null then
    raise exception 'INVALID_PERMANENT_BAN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_email, 0));

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
    perform public.ban_event_participant(v_user_id, 'permanent_ban');
  else
    -- 이미 행사 차단으로 계정이 삭제된 이메일도 현재 행사 차단을 유지한다.
    insert into public.banned_emails(email, reason)
      values (v_email, 'permanent_ban')
      on conflict (email) do nothing;
  end if;
  return v_user_id;
end;
$$;
revoke all on function public.add_permanent_ban(text, text, uuid) from public, anon, authenticated;
grant execute on function public.add_permanent_ban(text, text, uuid) to service_role;

create or replace function public.release_permanent_ban(p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if v_email is null or v_email !~ '^[^[:space:]@]+@cju[.]ac[.]kr$' then
    raise exception 'INVALID_EMAIL';
  end if;
  delete from public.permanent_bans where email = v_email;
  return found;
end;
$$;
revoke all on function public.release_permanent_ban(text) from public, anon, authenticated;
grant execute on function public.release_permanent_ban(text) to service_role;

-- 기존 pg_cron의 매분 session_tick 작업에서 만료된 차단 정보를 파기한다.
create or replace function public.session_tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.magic_link_throttle
   where window_start < now() - interval '2 hours';
  delete from public.permanent_bans where expires_at <= now();
end;
$$;
revoke all on function public.session_tick() from public, anon, authenticated;
