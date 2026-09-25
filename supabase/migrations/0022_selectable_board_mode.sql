-- =============================================================================
-- 0022: 행사별 보드 모드와 기본 선택 기회
--
-- opposite: 기존과 동일하게 이성 카드만 노출
-- selectable: 남학생/여학생 보드를 사용자가 자유롭게 전환
-- 행사 시작 뒤에는 두 정책 값을 바꾸지 못하며, 폐기 완료 시 안전 기본값으로 복귀한다.
-- =============================================================================

alter table public.session_config
  add column if not exists board_mode text not null default 'opposite'
    check (board_mode in ('opposite', 'selectable')),
  add column if not exists base_selection_allowance integer not null default 1
    check (base_selection_allowance in (1, 2));

create or replace function private.lock_started_event_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if now() >= old.starts_at
     and not old.purging
     and (new.board_mode is distinct from old.board_mode
          or new.base_selection_allowance is distinct from old.base_selection_allowance) then
    raise exception 'EVENT_RULES_LOCKED';
  end if;
  return new;
end;
$$;

revoke all on function private.lock_started_event_rules() from public, anon, authenticated;
drop trigger if exists session_config_lock_started_rules on public.session_config;
create trigger session_config_lock_started_rules
  before update on public.session_config
  for each row execute function private.lock_started_event_rules();

-- 새 참가자는 해당 회차에 고정된 기본 선택 기회로 시작한다.
create or replace function private.apply_event_base_allowance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.base_selection_allowance into new.allowance
    from public.session_config c
   where c.id = 1 and c.event_id = new.event_id;
  if new.allowance is null then raise exception 'STALE_EVENT'; end if;
  return new;
end;
$$;

revoke all on function private.apply_event_base_allowance() from public, anon, authenticated;
drop trigger if exists event_participants_base_allowance on private.event_participants;
create trigger event_participants_base_allowance
  before insert on private.event_participants
  for each row execute function private.apply_event_base_allowance();

-- 선택 번호를 영속화해 카드 삭제나 탈퇴 후에도 남은 상세 행의 번호가 바뀌지 않게 한다.
alter table public.matches add column if not exists selection_number integer;

with numbered as (
  select id, row_number() over (partition by viewer_user_id order by created_at, id)::integer as n
    from public.matches
)
update public.matches m set selection_number = numbered.n
  from numbered where numbered.id = m.id and m.selection_number is null;

alter table public.matches alter column selection_number set not null;
alter table public.matches add constraint matches_selection_number_positive
  check (selection_number > 0);
create unique index if not exists matches_viewer_selection_number_idx
  on public.matches(viewer_user_id, selection_number);
drop index if exists public.matches_one_per_viewer_nonbonus;

-- 교차 사용자 카드 SELECT는 RPC로만 제공한다. 직접 테이블 조회는 본인 카드 정책만 남는다.
drop policy if exists cards_opposite_gender_select on public.cards;

create or replace function public.board_cards(p_target_gender text default null)
returns table(id uuid, one_liner text, color text, gender text)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_viewer_gender text;
  v_mode text;
  v_target text;
begin
  if not private.app_actor_active() then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;
  if not public.board_is_open() then raise exception 'BOARD_CLOSED'; end if;

  select u.gender into v_viewer_gender from public.users u where u.id = v_viewer;
  select c.board_mode into v_mode from public.session_config c where c.id = 1;

  if v_mode = 'opposite' then
    v_target := case when v_viewer_gender = 'M' then 'F' else 'M' end;
  else
    if p_target_gender is null or p_target_gender not in ('M', 'F') then
      raise exception 'INVALID_TARGET_GENDER';
    end if;
    v_target := p_target_gender;
  end if;

  return query
  select card.id, card.one_liner, card.color, u.gender
    from public.cards card
    join public.users u on u.id = card.user_id
   where card.user_id <> v_viewer
     and u.gender = v_target
     and not card.hidden_by_user
     and not card.hidden_by_admin
     and private.gender_of(card.user_id) is not null
     and not exists (
       select 1 from public.matches m
        where m.viewer_user_id = v_viewer and m.viewed_card_id = card.id
     )
     and not private.card_is_full(card.id);
end;
$$;

revoke all on function public.board_cards(text) from public, anon;
grant execute on function public.board_cards(text) to authenticated;

create or replace function public.consume_slot_and_reveal(target_card_id uuid)
returns table(instagram_id text)
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

  return query select c.instagram_id from public.cards c where c.id = target_card_id;
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
  instagram_id text, bonus boolean, selection_number integer, created_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select m.id, c.id, c.one_liner, c.color, c.instagram_id,
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

-- 새 회차는 명시적으로 다시 선택하게 안전 기본값으로 초기화한다.
create or replace function public.finish_event_purge()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_event uuid := gen_random_uuid();
begin
  if exists(select 1 from public.users)
     or exists(select 1 from public.cards)
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
  return v_next_event;
end;
$$;

revoke all on function public.finish_event_purge() from public, anon, authenticated;
grant execute on function public.finish_event_purge() to service_role;

notify pgrst, 'reload schema';
