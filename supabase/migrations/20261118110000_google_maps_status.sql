-- Track whether each mosque has been submitted to / is live on Google Maps.
-- Google offers no public API to edit places, so staff submit through the
-- Google Maps app and mark the step here (who + when).

alter table public.mosques
  add column if not exists google_maps_status text not null default 'not_submitted'
    check (google_maps_status in ('not_submitted', 'submitted', 'live')),
  add column if not exists google_maps_submitted_at timestamptz,
  add column if not exists google_maps_submitted_by_name text not null default ''
    check (char_length(google_maps_submitted_by_name) <= 120);

-- Only bump updated_at / updated_by when the mosque data itself changed,
-- not when just the Google Maps status was marked.
create or replace function public.mosques_set_server_fields()
returns trigger
language plpgsql
as $$
declare
  tracking_cols text[] := array[
    'google_maps_status', 'google_maps_submitted_at', 'google_maps_submitted_by_name',
    'updated_at', 'updated_by'
  ];
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_at := now();
    new.updated_by := auth.uid();
    return new;
  end if;

  new.created_by      := old.created_by;
  new.created_by_name := old.created_by_name;
  new.created_at      := old.created_at;
  new.id              := old.id;

  if (to_jsonb(new) - tracking_cols) is distinct from (to_jsonb(old) - tracking_cols) then
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
  end if;
  return new;
end;
$$;

-- Any staff member may mark the Google Maps step for any mosque
-- (the person submitting to Google may not be the original documenter).
create or replace function public.set_google_maps_status(p_mosque_id text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_name text;
begin
  if not public.is_staff() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('not_submitted', 'submitted', 'live') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  select name into staff_name from public.profiles where id = auth.uid();

  update public.mosques
     set google_maps_status = p_status,
         google_maps_submitted_at = case when p_status = 'not_submitted' then null else now() end,
         google_maps_submitted_by_name = case when p_status = 'not_submitted' then '' else coalesce(staff_name, '') end
   where id = p_mosque_id;

  if not found then
    raise exception 'mosque not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_google_maps_status(text, text) from public, anon;
grant execute on function public.set_google_maps_status(text, text) to authenticated;
