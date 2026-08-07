-- =============================================================================
-- 0008: purge_magic_link_throttle() 의 WHERE 절 누락 수정
--
-- Supabase는 API 롤 세션에 safeupdate 가드를 걸어 WHERE 없는 DELETE/UPDATE를
-- 거부한다(SQLSTATE 21000, "DELETE requires a WHERE clause"). SECURITY DEFINER는
-- 실행 롤만 바꿀 뿐 세션 설정은 그대로라 이 가드가 함수 안에서도 적용된다.
-- 0007의 무조건 DELETE가 여기 걸려 어드민 데이터 폐기 시 throttle 테이블이
-- 비워지지 않았다. key_hash는 PK(NOT NULL)라 아래 조건은 전체 행과 일치한다.
-- =============================================================================

create or replace function public.purge_magic_link_throttle()
returns void
language sql
security definer
set search_path = public
as $$ delete from public.magic_link_throttle where key_hash is not null $$;

revoke all on function public.purge_magic_link_throttle() from public, anon, authenticated;
grant execute on function public.purge_magic_link_throttle() to service_role;
