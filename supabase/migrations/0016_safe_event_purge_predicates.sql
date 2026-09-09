-- Supabase 프로젝트에서 safeupdate가 활성화된 경우 WHERE 없는 DELETE는
-- SECURITY DEFINER 함수 안에서도 거부된다. 전체 행사 폐기라는 범위는 유지하되,
-- 각 테이블의 NOT NULL 기본키를 명시해 의도적인 전체 삭제임을 분명히 한다.
create or replace function public.purge_current_event_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select c.purging from public.session_config c where c.id = 1), false) then
    raise exception 'PURGE_NOT_STARTED';
  end if;

  delete from public.matches where id is not null;
  delete from public.cards where id is not null;
  delete from public.users where id is not null;
  delete from public.banned_emails where email is not null;
  delete from public.magic_link_throttle where key_hash is not null;
  delete from private.event_participants
   where event_id is not null and subject_key is not null;
end;
$$;

revoke all on function public.purge_current_event_data() from public, anon, authenticated;
grant execute on function public.purge_current_event_data() to service_role;

notify pgrst, 'reload schema';
