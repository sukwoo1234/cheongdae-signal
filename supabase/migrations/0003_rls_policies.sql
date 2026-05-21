alter table public.users enable row level security;
alter table public.cards enable row level security;
alter table public.matches enable row level security;
alter table public.session_config enable row level security;
alter table public.banned_emails enable row level security;

-- users
create policy users_self_select on public.users
  for select using (auth.uid() = id);
create policy users_self_update on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy users_self_insert on public.users
  for insert with check (auth.uid() = id);
create policy users_self_delete on public.users
  for delete using (auth.uid() = id);

-- cards (본인 카드: 전체 / 이성 카드: 한 줄 소개만)
create policy cards_self_all on public.cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy cards_opposite_gender_select on public.cards
  for select using (
    auth.uid() != user_id
    and not hidden_by_user
    and not hidden_by_admin
    and exists (
      select 1 from public.users me
      where me.id = auth.uid()
        and me.gender is not null
        and me.gender != (
          select gender from public.users where id = cards.user_id
        )
    )
    and not exists (
      select 1 from public.matches
      where viewer_user_id = auth.uid()
        and viewed_card_id = cards.id
    )
    and exists (
      select 1 from public.session_config
      where id = 1
        and not force_locked
        and starts_at <= now()
        and ends_at > now()
    )
  );

-- matches
create policy matches_self_select on public.matches
  for select using (auth.uid() = viewer_user_id);

create policy matches_self_insert on public.matches
  for insert with check (auth.uid() = viewer_user_id);

-- session_config (모두 read)
create policy session_config_read on public.session_config
  for select to authenticated using (true);
