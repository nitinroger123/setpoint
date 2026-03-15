-- Tournament Series (a named recurring event, e.g. "Revco 4s at ThePostBK")
create table public.tournament_series (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- e.g. 'Revco 4s at ThePostBK'
  format_id text not null references public.tournament_formats(id),
  location text,                               -- e.g. '53 Knickerbocker Ave, Brooklyn'
  description text,
  active boolean default true,
  created_at timestamptz default now()
);

-- Add series_id to sessions
alter table public.sessions
  add column series_id uuid references public.tournament_series(id);

create index on public.sessions(series_id);

-- RLS
alter table public.tournament_series enable row level security;
create policy "Public read series" on public.tournament_series for select using (true);
