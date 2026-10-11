-- Recheck retention and event participation in the same transaction that
-- removes an expired Auth account. A prior API read cannot authorize deletion:
-- another request may have rejoined the user in the meantime.
create or replace function public.expire_retained_account_if_eligible(
  p_user_id uuid,
  p_cutoff timestamptz
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_event_id uuid;
  v_ends_at timestamptz;
  v_purging boolean;
  v_last_active_at timestamptz;
  v_deleted_user uuid;
begin
  if p_user_id is null or p_cutoff is null then
    raise exception 'INVALID_ACCOUNT_EXPIRY';
  end if;

  -- Match the event-write lock order. A purge cannot change the event while
  -- eligibility is checked, and a concurrent rejoin serializes on users.
  select c.event_id, c.ends_at, c.purging
    into v_event_id, v_ends_at, v_purging
    from public.session_config c where c.id = 1 for share;
  if not found then raise exception 'SESSION_NOT_CONFIGURED'; end if;
  if v_purging then raise exception 'PURGE_IN_PROGRESS'; end if;

  select u.last_active_at into v_last_active_at
    from public.users u where u.id = p_user_id for update;
  if not found then return false; end if;
  if v_last_active_at is not null and v_last_active_at >= p_cutoff then
    return false;
  end if;

  -- Current-event data remains until the event ends, even when the account
  -- retention date has passed. The participant's ban state is irrelevant.
  if v_ends_at > pg_catalog.clock_timestamp() and exists (
    select 1 from private.event_participants ep
     where ep.event_id = v_event_id and ep.current_user_id = p_user_id
  ) then
    return false;
  end if;

  -- Removing only public.users would leave the identifiable Auth email and
  -- refresh sessions behind. Auth's FK cascades clear profiles and sessions.
  delete from auth.users a where a.id = p_user_id
    returning a.id into v_deleted_user;
  if v_deleted_user is null then raise exception 'AUTH_ACCOUNT_NOT_FOUND'; end if;
  return true;
end;
$$;

revoke all on function public.expire_retained_account_if_eligible(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.expire_retained_account_if_eligible(uuid, timestamptz)
  to service_role;

-- Keep the same lock order as expiry and registration. Previously rejoin took
-- users first and then session_config inside register_event_participant,
-- permitting a deadlock with expiry and an event purge waiting on the config.
create or replace function public.rejoin_event_participant(
  p_event_id uuid,
  p_user_id uuid,
  p_email text,
  p_subject_key text,
  p_retention_accepted boolean default false
)
returns table(allowance int, used int, remaining int, banned boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_event_id uuid;
  v_ends_at timestamptz;
  v_purging boolean;
  v_email text;
  v_retention_accepted_at timestamptz;
begin
  select c.event_id, c.ends_at, c.purging
    into v_event_id, v_ends_at, v_purging
    from public.session_config c where c.id = 1 for share;
  if not found then raise exception 'SESSION_NOT_CONFIGURED'; end if;
  if v_purging then raise exception 'PURGE_IN_PROGRESS'; end if;
  if v_event_id is distinct from p_event_id then raise exception 'STALE_EVENT'; end if;
  if v_ends_at <= pg_catalog.clock_timestamp() then raise exception 'EVENT_ENDED'; end if;

  select lower(u.email), u.retention_accepted_at
    into v_email, v_retention_accepted_at
    from public.users u where u.id = p_user_id for update;
  if v_email is null or v_email <> lower(p_email) then
    raise exception 'ACCOUNT_NOT_FOUND';
  end if;
  if v_retention_accepted_at is null and p_retention_accepted is not true then
    raise exception 'RETENTION_CONSENT_REQUIRED';
  end if;

  update public.users
     set retention_accepted_at = coalesce(retention_accepted_at, now()),
         last_active_at = now()
   where id = p_user_id;

  return query
    select r.allowance, r.used, r.remaining, r.banned
      from public.register_event_participant(
        p_event_id, p_user_id, lower(p_email), p_subject_key
      ) r;
end;
$$;

revoke all on function public.rejoin_event_participant(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.rejoin_event_participant(uuid, uuid, text, text, boolean)
  to service_role;
