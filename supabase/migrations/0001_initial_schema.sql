create extension if not exists pgsodium with schema pgsodium;
create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  gender text check (gender in ('M', 'F')),
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  banned boolean not null default false,
  banned_reason text,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  one_liner text not null check (char_length(one_liner) between 1 and 20),
  instagram_id text not null check (instagram_id ~ '^[a-zA-Z0-9._]{1,30}$'),
  color text not null check (color in ('yellow', 'pink', 'green', 'blue', 'purple', 'orange')),
  hidden_by_user boolean not null default false,
  hidden_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  viewer_user_id uuid not null references public.users(id) on delete cascade,
  viewed_card_id uuid not null references public.cards(id) on delete cascade,
  bonus boolean not null default false,
  created_at timestamptz not null default now(),
  unique (viewer_user_id, viewed_card_id)
);

create unique index matches_one_per_viewer_nonbonus
  on public.matches (viewer_user_id)
  where bonus = false;

create table public.session_config (
  id int primary key default 1 check (id = 1),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  threshold_male int not null default 5 check (threshold_male > 0),
  threshold_female int not null default 5 check (threshold_female > 0),
  force_locked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.banned_emails (
  email text primary key,
  banned_at timestamptz not null default now(),
  reason text
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cards_touch_updated_at before update on public.cards
  for each row execute function public.touch_updated_at();

create trigger session_config_touch_updated_at before update on public.session_config
  for each row execute function public.touch_updated_at();
