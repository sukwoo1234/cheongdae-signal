-- Add discovery controls after the production security migrations (0028-0032).
-- Keep the existing board RPC intact for clients deployed before discovery controls.
-- Only already-authorized cards gain a coarse freshness flag; exact registration
-- times, contact details and card-owner identifiers remain outside this result.
create function public.board_cards_discovery(
  p_target_gender text default null,
  p_sort text default 'random'
)
returns table(id uuid, one_liner text, color text, gender text, is_new boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_sort is null or p_sort not in ('random', 'newest') then
    raise exception 'INVALID_SORT';
  end if;

  return query
  select permitted.id, permitted.one_liner, permitted.color, permitted.gender,
         (card.created_at > pg_catalog.now() - interval '7 days'
           and card.created_at <= pg_catalog.now()) as is_new
    from public.board_cards(p_target_gender) as permitted
    join public.cards as card on card.id = permitted.id
   order by case when p_sort = 'newest' then card.created_at end desc,
            case when p_sort = 'newest' then card.id end desc;
  -- The API shuffles the 'random' result; no timestamp is exposed to clients.
end;
$$;

revoke all on function public.board_cards_discovery(text, text) from public, anon;
grant execute on function public.board_cards_discovery(text, text) to authenticated;
