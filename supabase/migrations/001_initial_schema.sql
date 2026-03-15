-- Players
create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique,
  email text unique,
  created_at timestamptz default now()
);

-- Sessions (each Saturday)
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  tournament_type text not null default 'reverse_coed_4s',
  num_rounds int not null default 4,
  notes text,
  created_at timestamptz default now()
);

-- Game results (one row per player per game)
create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  round_number int not null check (round_number between 1 and 4),
  game_number int not null check (game_number between 1 and 2),
  point_diff int not null,
  total_wins int,
  total_diff int,
  place int,
  team text,
  created_at timestamptz default now()
);

-- Indexes
create index on public.game_results(session_id);
create index on public.game_results(player_id);
create index on public.sessions(date desc);

-- Row Level Security
alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.game_results enable row level security;

-- Public read access
create policy "Public read players" on public.players for select using (true);
create policy "Public read sessions" on public.sessions for select using (true);
create policy "Public read game_results" on public.game_results for select using (true);
