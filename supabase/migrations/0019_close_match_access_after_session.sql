-- 행사 시간 밖에서는 이미 선택한 카드의 연락처도 조회할 수 없다.
-- 화면 로그아웃만으로 막지 않고 DB RPC 자체를 닫아 직접 호출도 차단한다.
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
    join public.session_config s on s.id = 1
   where private.app_actor_active()
     and m.viewer_user_id = auth.uid()
     and not s.purging
     and now() >= s.starts_at
     and now() < s.ends_at
   order by m.created_at desc
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated;
