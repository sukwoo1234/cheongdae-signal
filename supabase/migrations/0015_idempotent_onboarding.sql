-- 네트워크 지연이나 응답 유실 뒤 같은 온보딩 요청을 다시 보내도 성공하도록 한다.
-- 이미 확정된 성별과 다른 값으로 바꾸려는 요청은 계속 거부한다.
create or replace function public.complete_onboarding(
  p_gender text,
  p_terms_accepted boolean,
  p_privacy_accepted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.app_actor_active() then raise exception 'ACCOUNT_NOT_ALLOWED'; end if;
  if p_gender not in ('M', 'F') then raise exception 'INVALID_GENDER'; end if;
  if p_terms_accepted is not true or p_privacy_accepted is not true then
    raise exception 'CONSENT_REQUIRED';
  end if;

  update public.users
     set gender = coalesce(gender, p_gender),
         terms_accepted_at = coalesce(terms_accepted_at, now()),
         privacy_accepted_at = coalesce(privacy_accepted_at, now())
   where id = auth.uid()
     and (gender is null or gender = p_gender);

  if not found then raise exception 'GENDER_ALREADY_SET'; end if;
end;
$$;

revoke all on function public.complete_onboarding(text, boolean, boolean)
  from public, anon;
grant execute on function public.complete_onboarding(text, boolean, boolean)
  to authenticated;
