-- =============================================================================
-- 0023: 기본 선택 기회 변경을 현재 행사 참가자에게 동기화
--
-- 0022는 새 참가자의 allowance만 행사 설정값으로 초기화했다. 행사 시작 전에
-- 관리자가 기본 기회를 바꾸더라도 이미 가입한 참가자는 예전 값에 머물렀다.
-- 현재 참가자도 함께 갱신하되, allowance 중 기본값을 초과한 관리자 보너스는 보존한다.
-- =============================================================================

create or replace function private.sync_current_event_base_allowance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.base_selection_allowance is distinct from old.base_selection_allowance then
    update private.event_participants ep
       set allowance = new.base_selection_allowance
                     + greatest(ep.allowance - old.base_selection_allowance, 0)
     where ep.event_id = old.event_id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_current_event_base_allowance()
  from public, anon, authenticated;

drop trigger if exists session_config_sync_participant_allowance
  on public.session_config;
create trigger session_config_sync_participant_allowance
  after update of base_selection_allowance on public.session_config
  for each row execute function private.sync_current_event_base_allowance();

-- 이미 0022가 적용된 스테이징에서 설정은 2회지만 기존 참가자가 1회인 상태를 복구한다.
-- 기존 allowance가 더 크면 관리자 추가 지급분일 수 있으므로 줄이지 않는다.
update private.event_participants ep
   set allowance = greatest(ep.allowance, c.base_selection_allowance)
  from public.session_config c
 where c.id = 1
   and ep.event_id = c.event_id;
