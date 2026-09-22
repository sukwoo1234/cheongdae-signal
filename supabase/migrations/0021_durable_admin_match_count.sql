-- =============================================================================
-- 0021: 탈퇴 후에도 감소하지 않는 익명 누적 선택 수
--
-- matches 행은 개인정보 삭제 시 카드/계정과 함께 제거된다. 관리자 대시보드의
-- 누적 수치는 연락처나 카드 식별자가 없는 행사 원장의 used 합계를 사용한다.
-- =============================================================================

create or replace function public.admin_event_match_count()
returns integer
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(sum(ep.used), 0)::integer
    from private.event_participants ep
    join public.session_config c on c.id = 1 and c.event_id = ep.event_id
$$;

revoke all on function public.admin_event_match_count() from public, anon, authenticated;
grant execute on function public.admin_event_match_count() to service_role;

notify pgrst, 'reload schema';
