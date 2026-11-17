-- photo_count is a generated column and is NULL in NEW inside BEFORE triggers,
-- so exclude it from the "did the mosque data change?" comparison.
create or replace function public.mosques_set_server_fields()
returns trigger
language plpgsql
as $$
declare
  ignored_cols text[] := array[
    'google_maps_status', 'google_maps_submitted_at', 'google_maps_submitted_by_name',
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
