-- =============================================================================
-- 0017: 참가 현황과 행사 설정을 인증된 참가자 뒤로 이동
--
-- /board 페이지에서 인증을 확인하더라도 공개 anon 키에 DB 권한이 남아 있으면
-- 브라우저가 Supabase를 직접 호출해 일정과 성별 집계를 읽을 수 있다.
-- 공개 종료 화면에는 별도의 최소 API가 종료 여부만 전달한다.
-- =============================================================================

drop policy if exists session_config_read on public.session_config;
create policy session_config_read on public.session_config
  for select to authenticated using (true);

revoke select on public.session_config from anon;
grant select on public.session_config to authenticated;

revoke execute on function public.gender_counts() from anon;
revoke execute on function public.board_is_open() from anon;

notify pgrst, 'reload schema';
