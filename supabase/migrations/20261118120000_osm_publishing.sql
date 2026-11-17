-- Publish mosques to OpenStreetMap (free, open, editable by API) instead of Google Maps.

alter table public.mosques
  add column if not exists osm_published_at timestamptz,
  add column if not exists osm_published_by_name text not null default ''
    check (char_length(osm_published_by_name) <= 120);

-- Publishing metadata must not count as "the mosque data was edited".
create or replace function public.mosques_set_server_fields()
returns trigger
language plpgsql
as $$
declare
  ignored_cols text[] := array[
    'google_maps_status', 'google_maps_submitted_at', 'google_maps_submitted_by_name',
    'osm_id', 'osm_published_at', 'osm_published_by_name',
    'updated_at', 'updated_by', 'photo_count'
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

  if (to_jsonb(new) - ignored_cols) is distinct from (to_jsonb(old) - ignored_cols) then
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    new.updated_at := old.updated_at;
    new.updated_by := old.updated_by;
  end if;
  return new;
end;
$$;

-- Any staff member may record that a mosque was published to OpenStreetMap.
create or replace function public.mark_osm_published(p_mosque_id text, p_osm_id text)
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
  if p_osm_id !~ '^(node|way|relation)_[0-9]{1,20}$' then
    raise exception 'invalid osm id' using errcode = '22023';
  end if;

  select name into staff_name from public.profiles where id = auth.uid();

  update public.mosques
     set osm_id = p_osm_id,
         osm_published_at = now(),
         osm_published_by_name = coalesce(staff_name, '')
   where id = p_mosque_id;

  if not found then
    raise exception 'mosque not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.mark_osm_published(text, text) from public, anon;
grant execute on function public.mark_osm_published(text, text) to authenticated;
