-- =====================================================================
-- توثيق مساجد مكتب أوقاف القره بوللي — Supabase schema
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 254),
  role        text not null check (role in ('admin', 'documenter')),
  created_at  timestamptz not null default now(),
  created_by  uuid not null
);

create table if not exists public.mosques (
  id               text primary key
                   default ('mosque_' || replace(gen_random_uuid()::text, '-', ''))
                   check (id ~ '^[a-zA-Z0-9_\-]{1,128}$'),
  official_name    text not null check (char_length(official_name) between 1 and 150),
  common_name      text not null default '' check (char_length(common_name) <= 150),
  locality         text not null check (char_length(locality) between 1 and 100),
  landmark         text not null default '' check (char_length(landmark) <= 200),
  notes            text not null default '' check (char_length(notes) <= 500),
  maps_url         text not null
                   check (maps_url ~ '^https://www\.google\.com/maps\?q=-?[0-9]+(\.[0-9]+)?,-?[0-9]+(\.[0-9]+)?$'),
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  accuracy         integer not null default 0 check (accuracy between 0 and 100000),
  photos           text[] not null default '{}'
                   check (coalesce(array_length(photos, 1), 0) <= 3
                          and octet_length(array_to_string(photos, '')) <= 1050000),
  photo_count      integer generated always as (coalesce(array_length(photos, 1), 0)) stored,
  osm_id           text not null default '' check (osm_id ~ '^[a-zA-Z0-9_\-]{0,64}$'),
  google_place_id  text not null default '' check (google_place_id ~ '^[a-zA-Z0-9_\-]{0,128}$'),
  created_by       uuid not null default auth.uid() references auth.users(id),
  created_by_name  text not null check (char_length(created_by_name) between 1 and 120),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid not null default auth.uid()
);

create index if not exists mosques_created_at_idx on public.mosques (created_at desc);

create table if not exists public.app_settings (
  id                   text primary key check (id ~ '^[a-zA-Z0-9_\-]{1,128}$'),
  osm_publish_enabled  boolean not null default false,
  osm_use_production   boolean not null default false,
  updated_at           timestamptz not null default now(),
  updated_by           uuid not null default auth.uid()
);

-- ---------------------------------------------------------------------
-- Role helpers (security definer → no RLS recursion on profiles)
-- ---------------------------------------------------------------------

create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() = 'admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_staff_role() in ('admin', 'documenter'), false);
$$;

-- ---------------------------------------------------------------------
-- Server-controlled fields (timestamps, ownership cannot be forged)
-- ---------------------------------------------------------------------

create or replace function public.mosques_set_server_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by      := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at      := old.created_at;
    new.id              := old.id;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists mosques_server_fields on public.mosques;
create trigger mosques_server_fields
  before insert or update on public.mosques
  for each row execute function public.mosques_set_server_fields();

create or replace function public.app_settings_set_server_fields()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists app_settings_server_fields on public.app_settings;
create trigger app_settings_server_fields
  before insert or update on public.app_settings
  for each row execute function public.app_settings_set_server_fields();

create or replace function public.profiles_set_server_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.id         := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_server_fields on public.profiles;
create trigger profiles_server_fields
  before insert or update on public.profiles
  for each row execute function public.profiles_set_server_fields();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.mosques      enable row level security;
alter table public.app_settings enable row level security;

-- profiles: own row or admin can read; only admin can create/update; admin can't delete self
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_admin() and id <> auth.uid());

-- mosques: all staff read & create; owner or admin update/delete
drop policy if exists mosques_select on public.mosques;
create policy mosques_select on public.mosques
  for select to authenticated
  using (public.is_staff());

drop policy if exists mosques_insert on public.mosques;
create policy mosques_insert on public.mosques
  for insert to authenticated
  with check (public.is_staff());

drop policy if exists mosques_update on public.mosques;
create policy mosques_update on public.mosques
  for update to authenticated
  using (public.is_admin() or (created_by = auth.uid() and public.is_staff()))
  with check (public.is_admin() or (created_by = auth.uid() and public.is_staff()));

drop policy if exists mosques_delete on public.mosques;
create policy mosques_delete on public.mosques
  for delete to authenticated
  using (public.is_admin() or (created_by = auth.uid() and public.is_staff()));

-- app_settings: staff read; admin write
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select to authenticated
  using (public.is_staff());

drop policy if exists app_settings_insert on public.app_settings;
create policy app_settings_insert on public.app_settings
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Realtime (live list updates across devices)
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mosques'
  ) then
    alter publication supabase_realtime add table public.mosques;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_settings'
  ) then
    alter publication supabase_realtime add table public.app_settings;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Admin bootstrap
-- First create the admin user in: Authentication → Users → Add user
-- (email abdarhemsheet@gmail.com, tick "Auto Confirm User"), then run
-- this file. It links that account as the office admin.
-- ---------------------------------------------------------------------

alter table public.profiles disable trigger profiles_server_fields;

insert into public.profiles (id, name, email, role, created_by)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)),
       lower(u.email),
       'admin',
       u.id
from auth.users u
where lower(u.email) = 'abdarhemsheet@gmail.com'
on conflict (id) do update set role = 'admin';

alter table public.profiles enable trigger profiles_server_fields;
