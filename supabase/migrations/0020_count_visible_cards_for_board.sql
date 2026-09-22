-- =============================================================================
-- 0020: 보드 개방 인원을 가입자가 아닌 공개 가능한 카드 기준으로 집계
--
-- 온보딩만 마치고 카드를 작성하지 않은 사용자가 보드 개방 임계값에 포함되면
-- 실제 선택 가능한 카드가 부족한 상태에서 보드가 열릴 수 있다.
-- =============================================================================

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
  from public.cards card
  join public.users u on u.id = card.user_id
  join auth.users a on a.id = u.id
  join public.session_config c on c.id = 1 and not c.purging
  join private.event_participants ep
    on ep.event_id = c.event_id and ep.current_user_id = u.id
  where not card.hidden_by_user
    and not card.hidden_by_admin
    and not u.banned
    and not ep.banned
    and u.gender is not null
    and a.email_confirmed_at is not null
    and lower(a.email) = lower(u.email)
    and lower(a.email) ~ '^[^[:space:]@]+@cju[.]ac[.]kr$'
$$;

notify pgrst, 'reload schema';
