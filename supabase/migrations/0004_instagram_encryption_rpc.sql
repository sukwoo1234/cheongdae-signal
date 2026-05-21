-- 인스타 ID 컬럼 직접 select 차단
revoke select (instagram_id) on public.cards from anon, authenticated;

-- 슬롯 소비 + 인스타 ID 반환 (트랜잭션 안전)
create or replace function public.consume_slot_and_reveal(target_card_id uuid)
returns table(instagram_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  viewer_gender text;
  target_user uuid;
  target_gender text;
  target_hidden boolean;
  session_ok boolean;
  existing_match_count int;
begin
  if viewer is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select (not force_locked
          and starts_at <= now()
          and ends_at > now())
    into session_ok
    from public.session_config where id = 1;
  if not session_ok then
    raise exception 'BOARD_CLOSED';
  end if;

  select gender into viewer_gender from public.users where id = viewer;
  if viewer_gender is null then
    raise exception 'ONBOARDING_INCOMPLETE';
  end if;

  select user_id, hidden_by_user or hidden_by_admin
    into target_user, target_hidden
    from public.cards where id = target_card_id;

  if target_user is null then
    raise exception 'CARD_NOT_FOUND';
  end if;
  if target_user = viewer then
    raise exception 'CANNOT_VIEW_OWN_CARD';
  end if;
  if target_hidden then
    raise exception 'CARD_HIDDEN';
  end if;

  select gender into target_gender from public.users where id = target_user;
  if target_gender = viewer_gender then
    raise exception 'SAME_GENDER';
  end if;

  select count(*) into existing_match_count
    from public.matches
    where viewer_user_id = viewer and bonus = false;
  if existing_match_count > 0 then
    raise exception 'SLOT_ALREADY_USED';
  end if;

  insert into public.matches (viewer_user_id, viewed_card_id, bonus)
    values (viewer, target_card_id, false);

  return query
    select c.instagram_id from public.cards c where c.id = target_card_id;
end;
$$;

revoke all on function public.consume_slot_and_reveal(uuid) from public, anon;
grant execute on function public.consume_slot_and_reveal(uuid) to authenticated;

-- 내가 본 카드 목록 RPC
create or replace function public.my_matches()
returns table(
  match_id uuid,
  card_id uuid,
  one_liner text,
  color text,
  instagram_id text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  return query
    select m.id, c.id, c.one_liner, c.color, c.instagram_id, m.created_at
    from public.matches m
    join public.cards c on c.id = m.viewed_card_id
    where m.viewer_user_id = auth.uid()
    order by m.created_at desc;
end;
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated;
