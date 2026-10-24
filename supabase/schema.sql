-- Flake sync schema. Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run again; every statement is idempotent.
--
-- One row per app record (a debt, a bill, a check-in…), owned by the signed-in user.
-- Row Level Security means a login can only ever read or write its own rows.

create table if not exists public.flake_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null,           -- 'debts', 'bills', … or 'meta' for settings/household
  id text not null,                   -- the record's id inside the app
  data jsonb not null,                -- the record itself
  updated_at timestamptz not null,    -- when it was last edited, on the device that edited it
  deleted boolean not null default false,
  server_updated_at timestamptz not null default now(), -- when the server last accepted it (sync cursor)
  primary key (user_id, collection, id)
);

create index if not exists flake_records_cursor on public.flake_records (user_id, server_updated_at);

alter table public.flake_records enable row level security;

drop policy if exists "Own rows only" on public.flake_records;
create policy "Own rows only" on public.flake_records
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The server clock stamps every accepted write, so devices with skewed clocks still sync correctly.
create or replace function public.flake_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

drop trigger if exists flake_touch on public.flake_records;
create trigger flake_touch before insert or update on public.flake_records
  for each row execute function public.flake_touch();

-- Push a batch of records. A row only replaces the stored one if its edit is newer,
-- so an old offline edit can never overwrite a newer one from another device.
create or replace function public.flake_push(rows jsonb) returns void
language sql security invoker set search_path = '' as $$
  insert into public.flake_records (user_id, collection, id, data, updated_at, deleted)
  select auth.uid(), r ->> 'collection', r ->> 'id', r -> 'data', (r ->> 'updated_at')::timestamptz, coalesce((r ->> 'deleted')::boolean, false)
  from jsonb_array_elements(rows) as r
  on conflict (user_id, collection, id) do update
    set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
    where public.flake_records.updated_at < excluded.updated_at;
$$;

grant select, insert, update, delete on public.flake_records to authenticated;
grant execute on function public.flake_push(jsonb) to authenticated;
