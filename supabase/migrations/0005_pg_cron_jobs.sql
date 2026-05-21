create extension if not exists pg_cron;

-- 매분 호출되는 tick 함수. 현재는 RLS가 시각 검증을 처리하므로 빈 함수.
-- 미래 확장 (강제 로그아웃 알림, 통계 집계 등)에 사용 가능.
create or replace function public.session_tick()
returns void
language plpgsql
security definer
as $$
begin
  null;
end;
$$;

select cron.schedule(
  'session_tick',
  '* * * * *',
  $$ select public.session_tick(); $$
);
