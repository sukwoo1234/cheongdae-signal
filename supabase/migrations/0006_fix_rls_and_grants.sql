-- =============================================================================
-- 0006: RLS / 권한 전면 수정
--
-- 이 마이그레이션은 서로 얽힌 두 종류의 문제를 "한 번에" 고친다.
--   (A) 개인정보 유출: instagram_id 컬럼 보호가 실제로는 무효였고,
--       matches를 직접 INSERT하면 슬롯 제한을 우회할 수 있었다.
--   (B) 서비스 고장: 보드 정책이 users RLS에 막혀 항상 0행을 반환했고,
--       비로그인 사용자는 session_config를 못 읽어 500이 났다.
--
-- (B)만 고치면 (A)가 즉시 실현되므로 반드시 함께 적용해야 한다.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. 헬퍼 함수
--
-- RLS 정책 표현식 안에서 다른 테이블을 조회하면 그 테이블의 RLS도 적용된다.
-- users에는 "본인 행만" 정책이 걸려 있어서, 정책 안에서 남의 gender를 읽으면
-- 항상 NULL이 나왔다 (= 0006 이전 보드가 완전히 죽어 있던 원인).
-- SECURITY DEFINER 함수로 감싸서 이 문제를 우회한다.
-- -----------------------------------------------------------------------------

create or replace function public.gender_of(uid uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select gender from public.users where id = uid and not banned
$$;

revoke all on function public.gender_of(uuid) from public, anon;
grant execute on function public.gender_of(uuid) to authenticated;


-- 성별 인원 집계. 개별 row는 노출하지 않고 숫자만 돌려준다.
create or replace function public.gender_counts()
returns table(male int, female int)
language sql
security definer
stable
set search_path = public
as $$
  select
    count(*) filter (where gender = 'M')::int,
    count(*) filter (where gender = 'F')::int
  from public.users
  where not banned and gender is not null
$$;

revoke all on function public.gender_counts() from public;
grant execute on function public.gender_counts() to anon, authenticated;


-- 보드 개방 여부 단일 판정.
-- 기존에는 시간창/force_locked만 RLS에 있고 임계점은 화면 표시용 API에서만
-- 계산돼서, API를 직접 호출하면 임계점 게이팅이 통째로 우회됐다.
create or replace function public.board_is_open()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select not c.force_locked
       and c.starts_at <= now()
       and c.ends_at   >  now()
       and (select count(*) from public.users
             where gender = 'M' and not banned) >= c.threshold_male
       and (select count(*) from public.users
             where gender = 'F' and not banned) >= c.threshold_female
    from public.session_config c
    where c.id = 1
  ), false)
$$;

revoke all on function public.board_is_open() from public;
grant execute on function public.board_is_open() to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 2. users — 사용자 직접 쓰기 전면 차단
--
-- 기존 users_self_update는 행 소유권만 검사하고 컬럼 제한이 없어서
-- PATCH 한 번으로 banned=false(차단 자가해제), gender 변경(동성 카드 열람),
-- email 위조(제3자 차단 유발)가 전부 가능했다.
-- 쓰기는 SECURITY DEFINER RPC와 service_role 경유로만 남긴다.
-- -----------------------------------------------------------------------------

drop policy if exists users_self_update on public.users;
drop policy if exists users_self_insert on public.users;
drop policy if exists users_self_delete on public.users;
-- users_self_select(본인 행 읽기)는 그대로 유지한다.

revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;


-- 온보딩(성별 + 약관 동의). gender is null일 때만 통과하므로 1회성이 강제된다.
create or replace function public.complete_onboarding(p_gender text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_gender not in ('M', 'F') then
    raise exception 'INVALID_GENDER';
  end if;

  update public.users
     set gender              = p_gender,
         terms_accepted_at   = coalesce(terms_accepted_at, now()),
         privacy_accepted_at = coalesce(privacy_accepted_at, now())
   where id = auth.uid()
     and gender is null;

  if not found then
    raise exception 'GENDER_ALREADY_SET';
  end if;
end;
$$;

revoke all on function public.complete_onboarding(text) from public, anon;
grant execute on function public.complete_onboarding(text) to authenticated;


-- 청대 이메일 도메인을 DB 레벨에서도 강제한다.
-- 앱 라우트(magic-link)에만 있던 검사라, 공개된 anon 키로 Supabase Auth를
-- 직접 호출하면 외부인이 그대로 가입할 수 있었다.
-- 어드민은 users 행을 만들지 않으므로(로그인 시 /admin으로 직행) 영향 없다.
-- not valid: 기존 행은 검사하지 않고 이후 insert/update에만 적용.
alter table public.users
  drop constraint if exists users_cju_domain;
alter table public.users
  add constraint users_cju_domain check (email like '%@cju.ac.kr') not valid;


-- -----------------------------------------------------------------------------
-- 3. cards — 컬럼 단위 권한으로 instagram_id 실제 차단
--
-- 0004의 `revoke select (instagram_id) ...` 는 무효였다.
-- PostgreSQL은 테이블 단위 권한을 이미 가진 롤에 대한 컬럼 단위 REVOKE를
-- 무시한다(WARNING만 발생). Supabase가 public 스키마 테이블에 anon/authenticated로
-- 테이블 단위 권한을 기본 부여하므로 그 한 줄은 아무 일도 하지 않았다.
-- 테이블 단위 권한을 먼저 회수한 뒤 허용 컬럼만 다시 부여해야 한다.
-- -----------------------------------------------------------------------------

revoke all on public.cards from anon, authenticated;

grant select (id, user_id, one_liner, color,
              hidden_by_user, hidden_by_admin, created_at, updated_at)
  on public.cards to authenticated;

grant insert (user_id, one_liner, instagram_id, color)
  on public.cards to authenticated;

grant update (one_liner, instagram_id, color, hidden_by_user)
  on public.cards to authenticated;

-- DELETE는 부여하지 않는다.
-- 사용자가 자기 카드를 지우면 matches의 on delete cascade로 "그 카드를 본
-- 사람들"의 매칭 기록이 함께 사라지고, 부분 유니크 인덱스 점유가 풀려
-- 그들의 슬롯이 부활한다. 카드 삭제는 계정 삭제(service_role) 경유로만.


-- 본인 카드 조회용. instagram_id는 이제 직접 select할 수 없으므로
-- '내 카드 관리' 화면은 이 RPC를 통해서만 자기 인스타 ID를 받는다.
create or replace function public.my_card()
returns table(
  id             uuid,
  one_liner      text,
  instagram_id   text,
  color          text,
  hidden_by_user boolean,
  hidden_by_admin boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.one_liner, c.instagram_id, c.color,
         c.hidden_by_user, c.hidden_by_admin
  from public.cards c
  where auth.uid() is not null
    and c.user_id = auth.uid()
$$;

revoke all on function public.my_card() from public, anon;
grant execute on function public.my_card() to authenticated;


-- -----------------------------------------------------------------------------
-- 4. matches — 직접 INSERT 차단
--
-- 기존 matches_self_insert는 viewer_user_id만 검사하고 bonus 값은 보지 않았다.
-- 슬롯 1회 제한인 부분 유니크 인덱스는 `where bonus = false` 조건부라,
-- bonus=true로 넣으면 무제한 삽입이 가능했고 my_matches()가 그 전부에 대해
-- instagram_id를 돌려줬다 (= 참가자 전원 인스타 ID 일괄 수집 경로).
-- 삽입은 SECURITY DEFINER인 consume_slot_and_reveal 전용으로 만든다.
-- -----------------------------------------------------------------------------

drop policy if exists matches_self_insert on public.matches;

revoke all on public.matches from anon, authenticated;
grant select on public.matches to authenticated;
-- matches_self_select(본인 매칭만 조회) 정책은 유지된다.


-- -----------------------------------------------------------------------------
-- 5. session_config / banned_emails
-- -----------------------------------------------------------------------------

-- 주석은 "누구나 read"인데 코드는 `to authenticated`였다.
-- 그래서 비로그인 방문자의 /api/session이 NO_CONFIG 500을 뱉었다.
drop policy if exists session_config_read on public.session_config;
create policy session_config_read on public.session_config
  for select to anon, authenticated using (true);

revoke all on public.session_config from anon, authenticated;
grant select on public.session_config to anon, authenticated;

-- banned_emails는 RLS 정책이 없어 이미 전면 차단이지만 권한도 회수한다.
revoke all on public.banned_emails from anon, authenticated;


-- -----------------------------------------------------------------------------
-- 6. 보드 조회 정책 교체 (핵심 고장 지점)
-- -----------------------------------------------------------------------------

drop policy if exists cards_opposite_gender_select on public.cards;

create policy cards_opposite_gender_select on public.cards
  for select using (
    auth.uid() <> user_id
    and not hidden_by_user
    and not hidden_by_admin
    -- 중첩 서브쿼리 대신 SECURITY DEFINER 함수를 쓴다 (users RLS 우회)
    and public.gender_of(auth.uid()) is not null
    and public.gender_of(user_id) is not null
    and public.gender_of(auth.uid()) <> public.gender_of(user_id)
    -- 이미 본 카드는 보드에서 제외. matches_self_select와 조건이 일치하므로
    -- 이 서브쿼리는 RLS 아래에서도 정상 동작한다.
    and not exists (
      select 1 from public.matches
      where viewer_user_id = auth.uid()
        and viewed_card_id = cards.id
    )
    and public.board_is_open()
  );


-- -----------------------------------------------------------------------------
-- 7. 슬롯 소비 함수 보강
--
-- 추가된 검사: 차단된 사용자 / 카드 미등록자 / 상대가 차단된 경우 /
--             임계점 미달(board_is_open)
-- -----------------------------------------------------------------------------

create or replace function public.consume_slot_and_reveal(target_card_id uuid)
returns table(instagram_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer          uuid := auth.uid();
  viewer_gender   text;
  viewer_banned   boolean;
  viewer_has_card boolean;
  target_user     uuid;
  target_gender   text;
  target_hidden   boolean;
  target_banned   boolean;
  existing_match_count int;
begin
  if viewer is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select u.gender, u.banned
    into viewer_gender, viewer_banned
    from public.users u where u.id = viewer;

  if viewer_banned then
    raise exception 'BANNED';
  end if;
  if viewer_gender is null then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  if not public.board_is_open() then
    raise exception 'BOARD_CLOSED';
  end if;

  -- 슬롯은 "카드를 등록해야" 생긴다 (1 카드 = 1 슬롯).
  select exists(select 1 from public.cards c where c.user_id = viewer)
    into viewer_has_card;
  if not viewer_has_card then
    raise exception 'NO_CARD';
  end if;

  select c.user_id, (c.hidden_by_user or c.hidden_by_admin)
    into target_user, target_hidden
    from public.cards c where c.id = target_card_id;

  if target_user is null then
    raise exception 'CARD_NOT_FOUND';
  end if;
  if target_user = viewer then
    raise exception 'CANNOT_VIEW_OWN_CARD';
  end if;
  if target_hidden then
    raise exception 'CARD_HIDDEN';
  end if;

  select u.gender, u.banned
    into target_gender, target_banned
    from public.users u where u.id = target_user;

  if target_banned then
    raise exception 'CARD_HIDDEN';
  end if;
  if target_gender is null or target_gender = viewer_gender then
    raise exception 'SAME_GENDER';
  end if;

  select count(*) into existing_match_count
    from public.matches m
   where m.viewer_user_id = viewer and m.bonus = false;
  if existing_match_count > 0 then
    raise exception 'SLOT_ALREADY_USED';
  end if;

  -- 부분 유니크 인덱스 matches_one_per_viewer_nonbonus 가 동시 요청까지 막아준다.
  insert into public.matches (viewer_user_id, viewed_card_id, bonus)
  values (viewer, target_card_id, false);

  return query
    select c.instagram_id from public.cards c where c.id = target_card_id;
exception
  when unique_violation then
    raise exception 'SLOT_ALREADY_USED';
end;
$$;

revoke all on function public.consume_slot_and_reveal(uuid) from public, anon;
grant execute on function public.consume_slot_and_reveal(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 8. my_matches — bonus 컬럼 추가
--
-- 반환 시그니처가 바뀌므로 drop 후 재생성.
-- 기존에는 bonus를 안 돌려줘서 board 화면의 `!m.bonus` 판정이 항상 true가 됐고,
-- 어드민이 부여한 추가 슬롯이 클라이언트에서 무효화됐다.
-- -----------------------------------------------------------------------------

drop function if exists public.my_matches();

create function public.my_matches()
returns table(
  match_id     uuid,
  card_id      uuid,
  one_liner    text,
  color        text,
  instagram_id text,
  bonus        boolean,
  created_at   timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select m.id, c.id, c.one_liner, c.color, c.instagram_id, m.bonus, m.created_at
  from public.matches m
  join public.cards c on c.id = m.viewed_card_id
  where auth.uid() is not null
    and m.viewer_user_id = auth.uid()
  order by m.created_at desc
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated;
