-- ============================================================
-- T.C.C. schema
--
-- Raw values only, exactly as the local store holds them. Nothing scored is
-- ever written, so the scoring model can change without invalidating history.
--
-- Row level security is on for both tables and every policy is scoped to
-- auth.uid(), so a signed-in person can only ever read or write their own
-- rows. The anon key shipped in the browser cannot reach anyone else's data.
-- ============================================================

-- One row per metric per day per person.
create table if not exists public.entries (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  entry_date date        not null,
  metric_id  text        not null,
  value      numeric     not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date, metric_id)
);

create index if not exists entries_user_date_idx
  on public.entries (user_id, entry_date);

alter table public.entries enable row level security;

drop policy if exists "entries are private" on public.entries;
create policy "entries are private"
  on public.entries
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The metric library and which ones are switched on. One row per person.
create table if not exists public.configs (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  config     jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.configs enable row level security;

drop policy if exists "config is private" on public.configs;
create policy "config is private"
  on public.configs
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
