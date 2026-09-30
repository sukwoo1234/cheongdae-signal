-- =============================================================================
-- 0025: 연락 방법 종류 저장
--
-- 기존 instagram_id 컬럼은 암호화·접근 제어 경계를 유지하기 위해 이름을
-- 바꾸지 않고 실제 연락처 값 저장소로 계속 사용한다. contact_type을 별도로
-- 저장해 인스타그램·카카오톡·휴대전화를 입력부터 공개까지 명확히 구분한다.
-- =============================================================================

alter table public.cards
  add column if not exists contact_type text;

-- 과거 휴대전화 값은 안전하게 식별할 수 있다. ID는 둘을 자동 판별할 수 없으므로
-- 기존 기본 안내와 같은 인스타그램으로 두며, 현재 운영 데이터가 폐기된 시점에
-- 적용하므로 다음 회차의 신규 카드는 모두 사용자가 직접 종류를 선택한다.
update public.cards
   set contact_type = case
     when instagram_id ~ '^01(0|1|[6-9])[0-9]{7,8}$' then 'phone'
     else 'instagram'
   end
 where contact_type is null;

alter table public.cards
  alter column contact_type set default 'instagram',
  alter column contact_type set not null;

alter table public.cards
  add constraint cards_contact_type_check
  check (contact_type in ('instagram', 'kakao', 'phone'));

drop function if exists public.my_card();
create function public.my_card()
returns table(
  id uuid, one_liner text, instagram_id text, contact_type text, color text,
  hidden_by_user boolean, hidden_by_admin boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select c.id, c.one_liner, c.instagram_id, c.contact_type, c.color,
         c.hidden_by_user, c.hidden_by_admin
    from public.cards c
   where private.app_actor_active() and c.user_id = auth.uid()
$$;

revoke all on function public.my_card() from public, anon;
grant execute on function public.my_card() to authenticated;

drop function if exists public.consume_slot_and_reveal(uuid);
create function public.consume_slot_and_reveal(target_card_id uuid)
returns table(instagram_id text, contact_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  v_event_id uuid;
  v_purging boolean;
  v_max_views int;
  v_board_mode text;
  v_base_allowance int;
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

  select c.event_id, c.purging, c.max_views_per_card, c.board_mode, c.base_selection_allowance
    into v_event_id, v_purging, v_max_views, v_board_mode, v_base_allowance
    from public.session_config c where c.id = 1 for share;
  if v_purging then raise exception 'PURGE_IN_PROGRESS'; end if;
  if not public.board_is_open() then raise exception 'BOARD_CLOSED'; end if;

  select u.gender into viewer_gender from public.users u where u.id = viewer;
  if viewer_gender is null then raise exception 'ONBOARDING_INCOMPLETE'; end if;
  if not exists(select 1 from public.cards c where c.user_id = viewer) then raise exception 'NO_CARD'; end if;

  perform 1 from public.cards c where c.id = target_card_id for update;
  select c.user_id, (c.hidden_by_user or c.hidden_by_admin)
    into target_user, target_hidden from public.cards c where c.id = target_card_id;
  if target_user is null then raise exception 'CARD_NOT_FOUND'; end if;
  if target_user = viewer then raise exception 'CANNOT_VIEW_OWN_CARD'; end if;
  if target_hidden then raise exception 'CARD_HIDDEN'; end if;

  target_gender := private.gender_of(target_user);
  if target_gender is null then raise exception 'CARD_HIDDEN'; end if;
  if v_board_mode = 'opposite' and target_gender = viewer_gender then raise exception 'SAME_GENDER'; end if;

  perform 1 from private.event_participants ep
   where ep.event_id = v_event_id and ep.current_user_id in (viewer, target_user)
   order by ep.subject_key for update;

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
  if viewer_allowance is null or viewer_used >= viewer_allowance then raise exception 'SLOT_ALREADY_USED'; end if;
  if target_received is null then raise exception 'CARD_NOT_FOUND'; end if;
  if v_max_views is not null and target_received >= v_max_views then raise exception 'CARD_FULL'; end if;

  insert into public.matches(viewer_user_id, viewed_card_id, bonus, selection_number)
  values (viewer, target_card_id, viewer_used >= v_base_allowance, viewer_used + 1);

  update private.event_participants ep set used = used + 1
   where ep.event_id = v_event_id and ep.current_user_id = viewer;
  update private.event_participants ep set received_reveals = received_reveals + 1
   where ep.event_id = v_event_id and ep.current_user_id = target_user;

  return query
    select c.instagram_id, c.contact_type
      from public.cards c
     where c.id = target_card_id;
exception
  when unique_violation then raise exception 'CARD_ALREADY_VIEWED';
end;
$$;

revoke all on function public.consume_slot_and_reveal(uuid) from public, anon;
grant execute on function public.consume_slot_and_reveal(uuid) to authenticated;

drop function if exists public.my_matches();
create function public.my_matches()
returns table(
  match_id uuid, card_id uuid, one_liner text, color text,
  instagram_id text, contact_type text, bonus boolean,
  selection_number integer, created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select m.id, c.id, c.one_liner, c.color, c.instagram_id, c.contact_type,
         m.bonus, m.selection_number, m.created_at
    from public.matches m
    join public.cards c on c.id = m.viewed_card_id
    join public.session_config s on s.id = 1
   where private.app_actor_active()
     and m.viewer_user_id = auth.uid()
     and not s.purging
     and now() >= s.starts_at
     and now() < s.ends_at
   order by m.selection_number desc
$$;

revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated;

notify pgrst, 'reload schema';
