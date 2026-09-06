-- 매직링크 발송 제한 행은 이메일/IP별로 생성되므로, 오래된 식별자 해시가
-- 무기한 쌓이지 않게 기존 pg_cron tick에서 정리한다.
create or replace function public.session_tick()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.magic_link_throttle
   where window_start < now() - interval '2 hours';
$$;

revoke all on function public.session_tick() from public, anon, authenticated;
