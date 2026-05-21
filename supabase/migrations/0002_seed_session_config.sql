insert into public.session_config (id, starts_at, ends_at)
values (
  1,
  now() + interval '7 days',
  now() + interval '9 days'
)
on conflict (id) do nothing;
