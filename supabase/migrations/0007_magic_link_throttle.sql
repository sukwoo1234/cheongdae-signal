-- =============================================================================
-- 0007: 매직링크 발송 서버측 제한
--
-- 기존 쿨다운은 app/auth/sent/page.tsx 의 클라이언트 useState(60) 뿐이었다.
-- 브라우저를 거치지 않고 /api/auth/magic-link 를 직접 호출하면 무제한이라,
-- 스크립트 한 줄로 커스텀 SMTP(Gmail)의 일일 할당량을 태워버릴 수 있었다.
-- 할당량이 소진되면 실제 학생들이 로그인 메일을 받지 못한다.
-- =============================================================================

create table public.magic_link_throttle (
  -- 이메일 원문을 저장하지 않는다. 미가입자 주소까지 남기지 않기 위해 해시만 둔다.
  key_hash        text primary key,
  -- 'email' | 'ip' — 같은 테이블에 두 종류의 카운터를 담는다.
  scope           text not null check (scope in ('email', 'ip')),
  last_sent_at    timestamptz not null default now(),
  window_start    timestamptz not null default now(),
  sent_in_window  int not null default 0
);

create index magic_link_throttle_window_start_idx
  on public.magic_link_throttle (window_start);

-- RLS 활성화 + 정책 없음 = anon/authenticated 전면 차단.
-- service_role(서버 라우트)만 접근한다.
alter table public.magic_link_throttle enable row level security;
revoke all on public.magic_link_throttle from anon, authenticated;


-- 원자적으로 한도를 검사하고 카운터를 올린다.
-- 읽고-쓰는 두 단계로 나누면 동시 요청이 한도를 통과할 수 있다.
--
-- @param p_key_hash      식별자 해시
-- @param p_scope         'email' | 'ip'
-- @param p_cooldown_sec  직전 발송 이후 최소 간격
-- @param p_max_per_hour  1시간 창 내 최대 발송 수
-- @returns true = 허용(카운터 증가됨) / false = 한도 초과(카운터 그대로)
create or replace function public.consume_magic_link_quota(
  p_key_hash      text,
  p_scope         text,
  p_cooldown_sec  int,
  p_max_per_hour  int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now  timestamptz := now();
  rec      public.magic_link_throttle%rowtype;
begin
  insert into public.magic_link_throttle (key_hash, scope, last_sent_at, window_start, sent_in_window)
  values (p_key_hash, p_scope, row_now, row_now, 1)
  on conflict (key_hash) do nothing;

  if found then
    return true;                                  -- 최초 발송
  end if;

  -- 같은 행을 노리는 동시 요청을 직렬화한다.
  select * into rec
    from public.magic_link_throttle
   where key_hash = p_key_hash
     for update;

  if rec.key_hash is null then
    return true;                                  -- 경합 중 삭제됨. 통과시킨다.
  end if;

  -- 1시간 창이 지났으면 리셋
  if rec.window_start < row_now - interval '1 hour' then
    update public.magic_link_throttle
       set window_start = row_now, sent_in_window = 1, last_sent_at = row_now
     where key_hash = p_key_hash;
    return true;
  end if;

  if rec.last_sent_at > row_now - make_interval(secs => p_cooldown_sec) then
    return false;                                 -- 쿨다운 중
  end if;
  if rec.sent_in_window >= p_max_per_hour then
    return false;                                 -- 시간당 한도 초과
  end if;

  update public.magic_link_throttle
     set sent_in_window = rec.sent_in_window + 1, last_sent_at = row_now
   where key_hash = p_key_hash;
  return true;
end;
$$;

revoke all on function public.consume_magic_link_quota(text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.consume_magic_link_quota(text, text, int, int)
  to service_role;


-- 데이터 폐기 시 함께 비우기 위한 헬퍼 (wipe-data 라우트에서 호출).
create or replace function public.purge_magic_link_throttle()
returns void
language sql
security definer
set search_path = public
as $$ delete from public.magic_link_throttle $$;

revoke all on function public.purge_magic_link_throttle() from public, anon, authenticated;
grant execute on function public.purge_magic_link_throttle() to service_role;
