-- A participant request must carry the event observed by its browser. Checking
-- only the latest event in the route is insufficient after purge + rejoin.
-- Keep the config row locked through the write so a concurrent purge either
-- waits for this old-event write or finishes first and makes it fail stale.

create function public.create_event_card(
  p_expected_event_id uuid,
  p_user_id uuid,
  p_one_liner text,
  p_instagram_id text,
  p_contact_type text,
  p_color text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_event_id uuid;
  v_purging boolean;
  v_ends_at timestamptz;
  v_card_id uuid;
begin
  select c.event_id, c.purging, c.ends_at into v_event_id, v_purging, v_ends_at
    from public.session_config c where c.id = 1 for share;
  if not found then raise exception 'NO_CONFIG'; end if;
  if p_expected_event_id is distinct from v_event_id then raise exception 'STALE_EVENT'; end if;
  if v_purging then raise exception 'PURGE_IN_PROGRESS'; end if;
  if v_ends_at <= clock_timestamp() then raise exception 'SESSION_ENDED'; end if;
  if p_user_id is null or private.gender_of(p_user_id) is null
     or not private.season_participant_ready(p_user_id)
     or exists (
       select 1 from public.permanent_bans pb
       join public.users u on lower(u.email) = pb.email
       where u.id = p_user_id and pb.expires_at > now()
     )
     or not exists (
       select 1 from public.users u where u.id = p_user_id
         and u.terms_accepted_at is not null and u.privacy_accepted_at is not null
     ) then
    raise exception 'ACCOUNT_NOT_ALLOWED';
  end if;

  insert into public.cards(user_id, one_liner, instagram_id, contact_type, color)
    values (p_user_id, p_one_liner, p_instagram_id, p_contact_type, p_color)
    returning id into v_card_id;
  return v_card_id;
end;
$$;

revoke all on function public.create_event_card(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_event_card(uuid, uuid, text, text, text, text)
  to service_role;

-- Nullable patch values mean "leave the field unchanged". False remains an
-- explicit hidden_by_user value; hidden_by_admin is never changed here.
create function public.update_event_card(
  p_expected_event_id uuid,
  p_user_id uuid,
  p_one_liner text default null,
  p_instagram_id text default null,
  p_contact_type text default null,
  p_color text default null,
  p_hidden_by_user boolean default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_event_id uuid;
  v_purging boolean;
  v_card_id uuid;
begin
  select c.event_id, c.purging into v_event_id, v_purging
    from public.session_config c where c.id = 1 for share;
  if not found then raise exception 'NO_CONFIG'; end if;
  if p_expected_event_id is distinct from v_event_id then raise exception 'STALE_EVENT'; end if;
  if v_purging then raise exception 'PURGE_IN_PROGRESS'; end if;
  if (p_instagram_id is null) is distinct from (p_contact_type is null) then
    raise exception 'INVALID_CONTACT_PATCH';
  end if;
  if p_user_id is null or private.gender_of(p_user_id) is null
     or exists (
       select 1 from public.permanent_bans pb
       join public.users u on lower(u.email) = pb.email
       where u.id = p_user_id and pb.expires_at > now()
     ) then
    raise exception 'ACCOUNT_NOT_ALLOWED';
  end if;

  update public.cards c
     set one_liner = coalesce(p_one_liner, c.one_liner),
         instagram_id = coalesce(p_instagram_id, c.instagram_id),
         contact_type = coalesce(p_contact_type, c.contact_type),
         color = coalesce(p_color, c.color),
         hidden_by_user = coalesce(p_hidden_by_user, c.hidden_by_user)
   where c.user_id = p_user_id
   returning c.id into v_card_id;
  if v_card_id is null then raise exception 'CARD_NOT_FOUND'; end if;
  return v_card_id;
end;
$$;

revoke all on function public.update_event_card(uuid, uuid, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.update_event_card(uuid, uuid, text, text, text, text, boolean)
  to service_role;

notify pgrst, 'reload schema';
