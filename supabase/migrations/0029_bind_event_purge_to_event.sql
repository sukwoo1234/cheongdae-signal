-- Every destructive step is bound to the event the administrator confirmed.
-- A short-lived claim keeps concurrent HTTP requests from cleaning Auth users
-- after another worker has finished and rotated the event.
create table private.event_purge_lease (
  id integer primary key check (id = 1),
  event_id uuid not null,
  token uuid not null,
  expires_at timestamptz not null
);
revoke all on private.event_purge_lease from public, anon, authenticated;

create function private.assert_event_purge_lease(
  p_expected_event_id uuid, p_token uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_token uuid;
  v_expires_at timestamptz;
begin
  select l.token, l.expires_at into v_token, v_expires_at
    from private.event_purge_lease l
   where l.id = 1 and l.event_id = p_expected_event_id for share;
  if not found or v_token is distinct from p_token or v_expires_at <= now() then
    raise exception 'PURGE_LEASE_LOST';
  end if;
end;
$$;
revoke all on function private.assert_event_purge_lease(uuid, uuid)
  from public, anon, authenticated;

drop function public.begin_event_purge();
create function public.begin_event_purge(p_expected_event_id uuid, p_token uuid)
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
revoke all on function public.begin_event_purge(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_event_purge(uuid, uuid) to service_role;

create function public.release_event_purge_lease(
  p_expected_event_id uuid, p_token uuid
)
returns void language sql security definer set search_path = '' as $$
  delete from private.event_purge_lease
   where id = 1 and event_id = p_expected_event_id and token = p_token
$$;
revoke all on function public.release_event_purge_lease(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_event_purge_lease(uuid, uuid) to service_role;

drop function public.purge_current_event_data();
create function public.purge_current_event_data(
  p_expected_event_id uuid, p_token uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_purging boolean;
begin
  select c.event_id, c.purging into v_event_id, v_purging
    from public.session_config c where c.id = 1 for share;
  if v_event_id is distinct from p_expected_event_id then raise exception 'STALE_EVENT'; end if;
  if not coalesce(v_purging, false) then raise exception 'PURGE_NOT_STARTED'; end if;
  perform private.assert_event_purge_lease(p_expected_event_id, p_token);

  delete from public.matches where id is not null;
  delete from public.cards where id is not null;
  delete from public.banned_emails where email is not null;
  delete from public.magic_link_throttle where key_hash is not null;
  delete from private.event_participants
   where event_id is not null and subject_key is not null;
end;
$$;
revoke all on function public.purge_current_event_data(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.purge_current_event_data(uuid, uuid) to service_role;

drop function public.finish_event_purge();
create function public.finish_event_purge(
  p_expected_event_id uuid, p_token uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_next_event uuid := gen_random_uuid();
  v_event_id uuid;
  v_purging boolean;
begin
  select c.event_id, c.purging into v_event_id, v_purging
    from public.session_config c where c.id = 1 for update;
  if v_event_id is distinct from p_expected_event_id then raise exception 'STALE_EVENT'; end if;
  if not coalesce(v_purging, false) then raise exception 'PURGE_NOT_STARTED'; end if;
  perform private.assert_event_purge_lease(p_expected_event_id, p_token);
  if exists(select 1 from public.cards)
     or exists(select 1 from public.matches)
     or exists(select 1 from public.banned_emails)
     or exists(select 1 from public.magic_link_throttle)
     or exists(select 1 from private.event_participants) then
    raise exception 'PURGE_INCOMPLETE';
  end if;

  update public.session_config
     set event_id = v_next_event, purging = false, force_locked = true,
         max_views_per_card = null, board_mode = 'opposite', base_selection_allowance = 1
   where id = 1 and purging;
  delete from private.event_purge_lease
   where id = 1 and event_id = p_expected_event_id and token = p_token;

  update public.users u
     set banned = exists (
           select 1 from public.permanent_bans pb
            where pb.email = lower(u.email) and pb.expires_at > now()
         ),
         banned_reason = case when exists (
           select 1 from public.permanent_bans pb
            where pb.email = lower(u.email) and pb.expires_at > now()
         ) then 'permanent_ban' else null end
   where u.id is not null;
  return v_next_event;
end;
$$;
revoke all on function public.finish_event_purge(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finish_event_purge(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
