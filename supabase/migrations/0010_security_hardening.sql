-- =============================================================================
-- 0010: 보안 경계 보강
--
-- 0005의 session_tick은 SECURITY DEFINER 빈 함수인데 기본 EXECUTE 권한이
-- PUBLIC에 남아 있었다. 실제로 anon REST 호출이 204를 반환했으므로 공개
-- 실행 권한을 회수한다. cron 실행 주체(postgres/소유자)는 계속 실행할 수 있다.
-- =============================================================================

revoke all on function public.session_tick() from public, anon, authenticated;

-- 0006의 함수는 API가 받은 약관 값을 DB에 전달하지 않고 현재 시각을 기록했다.
-- 인증된 사용자가 RPC를 직접 호출하면 API를 우회해 동의 없이 온보딩할 수 있었으므로,
-- 동의 두 항목을 함수 인자로 받아 DB 경계에서 true를 강제한다.
drop function if exists public.complete_onboarding(text);

create or replace function public.complete_onboarding(
  p_gender text,
  p_terms_accepted boolean,
  p_privacy_accepted boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_gender not in ('M', 'F') then
    raise exception 'INVALID_GENDER';
  end if;
  if p_terms_accepted is not true or p_privacy_accepted is not true then
    raise exception 'CONSENT_REQUIRED';
  end if;

  update public.users
     set gender              = p_gender,
         terms_accepted_at   = coalesce(terms_accepted_at, now()),
         privacy_accepted_at = coalesce(privacy_accepted_at, now())
   where id = auth.uid()
     and gender is null;

  if not found then
    raise exception 'GENDER_ALREADY_SET';
  end if;
end;
$$;

revoke all on function public.complete_onboarding(text, boolean, boolean)
  from public, anon;
grant execute on function public.complete_onboarding(text, boolean, boolean)
  to authenticated;
