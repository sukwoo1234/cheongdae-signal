-- =============================================================================
-- 0009: 카드당 열람 상한 (성비 붕괴 안전망)
--
-- 카드는 "본 사람의 보드에서만" 사라진다 (0003/0006의 정책 조건이
-- viewer_user_id = auth.uid() 기준이라 뷰어별로 계산된다). 이건 의도된 설계다 —
-- 전역에서 내려가면 먼저 들어온 사람들이 카드를 다 걷어가고 나머지는
-- 빈 보드를 보게 된다.
--
-- 대가는 열람 편중이다. 성비가 기울면 소수 성별의 인기 카드가 수십 번 열리고,
-- 그 사람은 모르는 사람 수십 명에게 인스타그램 ID가 넘어간다.
-- 반대편에서는 대다수가 한 번도 열람되지 않는다.
--
-- 이 마이그레이션은 카드 하나가 열릴 수 있는 횟수에 상한을 둔다.
-- 상한을 넉넉히 잡으면(예: 5) 성비가 정상일 때는 평균 열람이 1회 안팎이라
-- 아무 영향이 없고, 붕괴했을 때만 작동하는 브레이크가 된다.
-- null이면 무제한 — 기본값은 null이라 명시적으로 켜야 동작한다.
-- =============================================================================

alter table public.session_config
  add column if not exists max_views_per_card int
  check (max_views_per_card is null or max_views_per_card > 0);

comment on column public.session_config.max_views_per_card is
  '카드 하나가 열람될 수 있는 최대 횟수. null이면 무제한.';

-- 카드별 열람 수를 세는 경로가 생겼으므로 인덱스를 둔다.
-- 기존 unique (viewer_user_id, viewed_card_id) 는 선두 컬럼이 viewer라 여기엔 못 쓴다.
create index if not exists matches_viewed_card_id_idx
  on public.matches (viewed_card_id);


-- 이 함수는 반드시 SECURITY DEFINER여야 한다.
--
-- matches 에는 matches_self_select (auth.uid() = viewer_user_id) 정책이 걸려 있어서,
-- RLS 정책 표현식 안에서 그냥 count(*)를 하면 "내가 본 것"만 세어져 항상 0 또는 1이 된다.
-- 0006에서 gender_of()로 고쳤던 것과 정확히 같은 함정이다.
create or replace function public.card_is_full(p_card_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select (select count(*) from public.matches m where m.viewed_card_id = p_card_id)
             >= c.max_views_per_card
    from public.session_config c
    where c.id = 1
      and c.max_views_per_card is not null
  ), false)
$$;

revoke all on function public.card_is_full(uuid) from public, anon;
grant execute on function public.card_is_full(uuid) to authenticated;


-- 보드 정책에 상한 조건 추가.
-- 상한에 도달한 카드는 이미 열람한 카드와 똑같이 조용히 사라진다.
-- (열람 횟수를 클라이언트에 노출하면 참가자를 인기순으로 줄 세울 수 있으므로
--  "마감" 배지 같은 표시는 하지 않는다.)
drop policy if exists cards_opposite_gender_select on public.cards;

create policy cards_opposite_gender_select on public.cards
  for select using (
    auth.uid() <> user_id
    and not hidden_by_user
    and not hidden_by_admin
    and public.gender_of(auth.uid()) is not null
    and public.gender_of(user_id) is not null
    and public.gender_of(auth.uid()) <> public.gender_of(user_id)
    and not exists (
      select 1 from public.matches
      where viewer_user_id = auth.uid()
        and viewed_card_id = cards.id
    )
    and not public.card_is_full(cards.id)
    and public.board_is_open()
  );


-- 슬롯 소비 함수에도 같은 검사를 넣는다.
-- 정책만으로는 부족하다 — 이 함수는 SECURITY DEFINER라 RLS를 우회하므로
-- 보드에서 사라진 카드의 id를 직접 넘기면 그대로 통과한다.
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
  max_views       int;
  view_count      int;
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

  select exists(select 1 from public.cards c where c.user_id = viewer)
    into viewer_has_card;
  if not viewer_has_card then
    raise exception 'NO_CARD';
  end if;

  -- 같은 카드를 동시에 노리는 요청을 직렬화한다.
  -- 이 잠금이 없으면 두 사람이 동시에 "마지막 한 자리"를 통과해 상한을 넘긴다.
  -- 잠금 범위가 카드 한 행이라 경합은 인기 카드에서만 발생한다 — 정확히 보호하려는 지점이다.
  perform 1 from public.cards where id = target_card_id for update;

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

  select c.max_views_per_card into max_views
    from public.session_config c where c.id = 1;
  if max_views is not null then
    select count(*) into view_count
      from public.matches m where m.viewed_card_id = target_card_id;
    if view_count >= max_views then
      raise exception 'CARD_FULL';
    end if;
  end if;

  select count(*) into existing_match_count
    from public.matches m
   where m.viewer_user_id = viewer and m.bonus = false;
  if existing_match_count > 0 then
    raise exception 'SLOT_ALREADY_USED';
  end if;

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
