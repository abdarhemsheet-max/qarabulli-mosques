-- Auto-link the office admin account the first time it is created.
-- Grants 'admin' only to abdarhemsheet@gmail.com, and only while no admin exists yet.

-- Allow system-side inserts (no signed-in user, e.g. from an auth trigger) to keep created_by.
create or replace function public.profiles_set_server_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.id         := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

create or replace function public.bootstrap_office_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) = 'abdarhemsheet@gmail.com'
     and not exists (select 1 from public.profiles where role = 'admin') then
    insert into public.profiles (id, name, email, role, created_by)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
      lower(new.email),
      'admin',
      new.id
    )
    on conflict (id) do update set role = 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_bootstrap_admin on auth.users;
create trigger on_auth_user_created_bootstrap_admin
  after insert on auth.users
  for each row execute function public.bootstrap_office_admin();
