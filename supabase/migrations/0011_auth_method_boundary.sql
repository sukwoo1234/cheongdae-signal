-- =============================================================================
-- 0011: 앱 로그인 방식 경계
--
-- anon 키로는 Supabase Auth의 password endpoint도 직접 호출할 수 있다. 앱은
-- 매직링크만 제공하므로, JWT의 서명 검증된 amr claim을 DB와 서버 양쪽에서
-- 확인해야 비밀번호/복구 세션이 기존 계정의 카드·매칭 데이터에 접근하지 못한다.
-- =============================================================================

create or replace function public.is_magic_link_session()
returns boolean
language sql
stable
set search_path = public
as $$
  select
    auth.uid() is not null
    and jsonb_typeof(coalesce(auth.jwt()->'amr', '[]'::jsonb)) = 'array'
    and exists (
      select 1
        from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) as entries(entry)
       where (jsonb_typeof(entries.entry) = 'object' and entries.entry->>'method' in ('magiclink', 'otp'))
          or (jsonb_typeof(entries.entry) = 'string' and entries.entry #>> '{}' in ('magiclink', 'otp'))
    )
$$;

revoke all on function public.is_magic_link_session() from public, anon;
grant execute on function public.is_magic_link_session() to authenticated;

drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select using (auth.uid() = id and public.is_magic_link_session());

drop policy if exists cards_self_all on public.cards;
create policy cards_self_all on public.cards
  for all
  using (auth.uid() = user_id and public.is_magic_link_session())
  with check (auth.uid() = user_id and public.is_magic_link_session());

drop policy if exists cards_opposite_gender_select on public.cards;
create policy cards_opposite_gender_select on public.cards
  for select using (
    public.is_magic_link_session()
    and auth.uid() <> user_id
    and not hidden_by_user
    and not hidden_by_admin
    and public.gender_of(auth.uid()) is not null
    and public.gender_of(user_id) is not null
    and public.gender_of(auth.uid()) <> public.gender_of(user_id)
    and not exists (
      select 1
        from public.matches
       where viewer_user_id = auth.uid()
         and viewed_card_id = cards.id
    )
    and not public.card_is_full(cards.id)
    and public.board_is_open()
  );

drop policy if exists matches_self_select on public.matches;
create policy matches_self_select on public.matches
  for select using (auth.uid() = viewer_user_id and public.is_magic_link_session());

create or replace function public.complete_onboarding(
  p_gender text,
  p_terms_accepted boolean,
  p_privacy_accepted boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if not public.is_magic_link_session() then
    raise exception 'AUTH_METHOD_NOT_ALLOWED';
  end if;
  if p_gender not in ('M', 'F') then
    raise exception 'INVALID_GENDER';
  end if;
  if p_terms_accepted is not true or p_privacy_accepted is not true then
    raise exception 'CONSENT_REQUIRED';
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

revoke all on function public.complete_onboarding(text, boolean, boolean)
  from public, anon;
grant execute on function public.complete_onboarding(text, boolean, boolean)
  to authenticated;

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
   where public.is_magic_link_session()
     and c.user_id = auth.uid()
$$;

revoke all on function public.my_card() from public, anon;
grant execute on function public.my_card() to authenticated;

create or replace function public.my_matches()
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
   where public.is_magic_link_session()
     and m.viewer_user_id = auth.uid()
   order by m.created_at desc
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated;

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
  if not public.is_magic_link_session() then
    raise exception 'AUTH_METHOD_NOT_ALLOWED';
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
