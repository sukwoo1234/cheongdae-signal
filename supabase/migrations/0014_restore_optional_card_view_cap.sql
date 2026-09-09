-- =============================================================================
-- 0014: 카드 공개 상한을 다시 선택 설정으로 복구
--
-- 한 참가자의 선택 기회(기본 1회)와 한 카드가 선택될 수 있는 횟수는 별개다.
-- max_views_per_card가 null이면 같은 카드를 여러 참가자가 선택할 수 있고,
-- 관리자가 숫자를 입력한 경우에만 카드별 공개 상한을 적용한다.
-- =============================================================================

alter table public.session_config
  alter column max_views_per_card drop not null,
  alter column max_views_per_card drop default;

-- 0013 적용 직후 강제로 들어간 1명을 기존 기본 동작인 무제한으로 되돌린다.
update public.session_config set max_views_per_card = null where id = 1;

comment on column public.session_config.max_views_per_card is
  '카드 하나가 열람될 수 있는 최대 횟수. null이면 무제한.';

create or replace function private.card_is_full(p_card_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.max_views_per_card is not null
       and ep.received_reveals >= c.max_views_per_card
      from public.cards card
      join public.session_config c on c.id = 1
      join private.event_participants ep
        on ep.event_id = c.event_id and ep.current_user_id = card.user_id
     where card.id = p_card_id
  ), true)
$$;

revoke all on function private.card_is_full(uuid) from public, anon, authenticated;
grant execute on function private.card_is_full(uuid) to authenticated;

-- 행사 폐기 뒤 새 행사도 기본값은 무제한으로 시작해야 한다.
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
         max_views_per_card = null
   where id = 1 and purging;
  if not found then raise exception 'PURGE_NOT_STARTED'; end if;
  return v_next_event;
end;
$$;

revoke all on function public.finish_event_purge() from public, anon, authenticated;
grant execute on function public.finish_event_purge() to service_role;

notify pgrst, 'reload schema';
