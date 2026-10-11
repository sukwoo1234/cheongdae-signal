-- Auth user deletion is external to a Postgres transaction. Hold an event-bound
-- lease until it finishes, so a purge cannot rotate the event in between.
create table private.event_admin_action_lease (
  token uuid primary key,
  event_id uuid not null,
  expires_at timestamptz not null
);
revoke all on private.event_admin_action_lease from public, anon, authenticated;
create index event_admin_action_lease_active_idx
  on private.event_admin_action_lease(event_id, expires_at);

create function public.acquire_event_admin_action(
  p_expected_event_id uuid,
  p_token uuid,
  p_card_id uuid default null,
  p_user_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_config public.session_config%rowtype;
  v_user_id uuid;
begin
  if p_expected_event_id is null or p_token is null
     or (p_card_id is null) = (p_user_id is null) then
    raise exception 'INVALID_ADMIN_ACTION';
  end if;

  -- begin_event_purge takes the same row lock before checking this lease.
  select * into v_config from public.session_config where id = 1 for update;
  if not found then raise exception 'NO_CONFIG'; end if;
  if v_config.event_id is distinct from p_expected_event_id then
    raise exception 'STALE_EVENT';
  end if;
  if v_config.purging then raise exception 'PURGE_IN_PROGRESS'; end if;

  delete from private.event_admin_action_lease where expires_at <= now();

  if p_card_id is not null then
    select c.user_id into v_user_id
      from public.cards c
      join private.event_participants ep
        on ep.event_id = v_config.event_id and ep.current_user_id = c.user_id
     where c.id = p_card_id;
  else
    select u.id into v_user_id
      from public.users u
      join private.event_participants ep
        on ep.event_id = v_config.event_id and ep.current_user_id = u.id
     where u.id = p_user_id;
  end if;
  if v_user_id is null then raise exception 'TARGET_NOT_FOUND'; end if;

  insert into private.event_admin_action_lease(token, event_id, expires_at)
    values (p_token, v_config.event_id, now() + interval '10 minutes');
  return v_user_id;
end;
$$;
revoke all on function public.acquire_event_admin_action(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.acquire_event_admin_action(uuid,uuid,uuid,uuid)
  to service_role;

create function public.release_event_admin_action(
  p_expected_event_id uuid,
  p_token uuid
)
returns void language sql security definer set search_path = '' as $$
  delete from private.event_admin_action_lease
   where event_id = p_expected_event_id and token = p_token
$$;
revoke all on function public.release_event_admin_action(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.release_event_admin_action(uuid,uuid)
  to service_role;

-- The old function still takes an event-bound purge lease. Check moderation
-- leases under the session row lock so lease creation and purge start serialize.
create or replace function public.begin_event_purge(p_expected_event_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_token uuid;
  v_expires_at timestamptz;
begin
  if p_expected_event_id is null or p_token is null then
    raise exception 'INVALID_PURGE_REQUEST';
  end if;

  select c.event_id into v_event_id
    from public.session_config c where c.id = 1 for update;
  if not found then raise exception 'NO_CONFIG'; end if;
  if v_event_id is distinct from p_expected_event_id then
    raise exception 'STALE_EVENT';
  end if;
  delete from private.event_admin_action_lease where expires_at <= now();
  if exists (
    select 1 from private.event_admin_action_lease l
     where l.event_id = v_event_id and l.expires_at > now()
  ) then
    raise exception 'MODERATION_BUSY';
  end if;

  select l.token, l.expires_at into v_token, v_expires_at
    from private.event_purge_lease l where l.id = 1 for update;
  if found and v_expires_at > now() and v_token is distinct from p_token then
    raise exception 'PURGE_BUSY';
  end if;

  insert into private.event_purge_lease(id, event_id, token, expires_at)
    values (1, p_expected_event_id, p_token, now() + interval '10 minutes')
    on conflict (id) do update
      set event_id = excluded.event_id, token = excluded.token,
          expires_at = excluded.expires_at;
  update public.session_config
     set purging = true, force_locked = true where id = 1;
end;
$$;
revoke all on function public.begin_event_purge(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.begin_event_purge(uuid,uuid) to service_role;

-- A delayed grant from the previous event must never grant a slot after the
-- target has rejoined the new event. The inner RPC retains its idempotency.
create function public.grant_event_slot_for_event(
  p_expected_event_id uuid,
  p_user_id uuid
)
returns table(allowance int, used int, remaining int)
language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_purging boolean;
begin
  select c.event_id, c.purging into v_event_id, v_purging
    from public.session_config c where c.id = 1 for share;
  if v_event_id is distinct from p_expected_event_id then
    raise exception 'STALE_EVENT';
  end if;
  if coalesce(v_purging, true) then raise exception 'PURGE_IN_PROGRESS'; end if;
  return query select s.allowance, s.used, s.remaining
    from public.grant_event_slot(p_user_id) s;
end;
$$;
revoke all on function public.grant_event_slot_for_event(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.grant_event_slot_for_event(uuid,uuid)
  to service_role;

-- The API checks timestamps too, but concurrent updates must be unable to
-- construct an invalid session window between separate read and write calls.
alter table public.session_config
  add constraint session_config_valid_window check (ends_at > starts_at);

notify pgrst, 'reload schema';
