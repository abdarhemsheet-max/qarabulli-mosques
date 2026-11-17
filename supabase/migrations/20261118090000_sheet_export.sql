-- Read-only export used by the Google Sheets sync script (Apps Script).
-- Access is gated by a private token stored in integration_secrets (no RLS
-- policies → unreadable from the app). The token is set outside of git.

create table if not exists public.integration_secrets (
  name    text primary key,
  secret  text not null check (char_length(secret) >= 32)
);

alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;

create or replace function public.sheet_export(p_token text)
returns table (
  id                text,
  official_name     text,
  common_name       text,
  locality          text,
  landmark          text,
  notes             text,
  lat               double precision,
  lng               double precision,
  maps_url          text,
  accuracy          integer,
  photo_count       integer,
  osm_id            text,
  google_place_id   text,
  created_by_name   text,
  created_by_email  text,
  created_at        timestamptz,
  updated_by_name   text,
  updated_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_token is null or not exists (
    select 1 from public.integration_secrets s
    where s.name = 'sheet_sync' and s.secret = p_token
  ) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  return query
    select m.id,
           m.official_name,
           m.common_name,
           m.locality,
           m.landmark,
           m.notes,
           m.lat,
           m.lng,
           m.maps_url,
           m.accuracy,
           m.photo_count,
           m.osm_id,
           m.google_place_id,
           coalesce(c.name, m.created_by_name),
           coalesce(c.email, ''),
           m.created_at,
           coalesce(u.name, ''),
           m.updated_at
    from public.mosques m
    left join public.profiles c on c.id = m.created_by
    left join public.profiles u on u.id = m.updated_by
    order by m.created_at asc;
end;
$$;

revoke all on function public.sheet_export(text) from public;
grant execute on function public.sheet_export(text) to anon, authenticated;
