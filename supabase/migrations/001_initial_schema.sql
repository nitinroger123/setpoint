-- Tournament Formats (data-driven, extensible)
create table public.tournament_formats (
  id text primary key,                        -- e.g. 'revco-roundrobin-4s'
  name text not null,                         -- e.g. 'Reverse Coed Round Robin 4s'
  description text,
  team_count int not null default 3,          -- number of teams per session
  players_per_team int not null default 4,    -- players per team
  num_rounds int not null default 4,          -- rounds per session
  games_per_round int not null default 2,     -- games each team plays per round
  total_games_per_player int not null default 8,
  scoring_type text not null default 'point_diff',  -- 'point_diff' | 'win_loss'
  ranking_primary text not null default 'wins',     -- primary ranking field
  ranking_secondary text not null default 'point_diff',
  gender_rule text default 'reverse_coed',    -- 'reverse_coed' | 'open' | 'mens' | 'womens'
  active boolean default true,
  created_at timestamptz default now()
);

-- Seed the first format
insert into public.tournament_formats (
  id, name, description,
  team_count, players_per_team, num_rounds, games_per_round, total_games_per_player,
  scoring_type, ranking_primary, ranking_secondary, gender_rule
) values (
  'revco-roundrobin-4s',
  'Reverse Coed Round Robin 4s',
  'Three teams of 4 (Aces, Kings, Queens). Each team plays the other two teams each round. 4 rounds total, 8 games per player. Top 4 individuals win. Reverse coed: must have opposite gender ratio than standard.',
  3, 4, 4, 2, 8,
  'point_diff', 'wins', 'point_diff', 'reverse_coed'
);

-- Players
create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique,
  email text unique,
  created_at timestamptz default now()
);

-- Sessions (each Saturday event)
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  format_id text not null references public.tournament_formats(id) default 'revco-roundrobin-4s',
  notes text,
  created_at timestamptz default now()
);

-- Game results (one row per player per game)
create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  round_number int not null,
  game_number int not null,
  team text,                  -- 'Aces' | 'Kings' | 'Queens'
  point_diff int not null,    -- positive = win side, negative = loss side
  total_wins int,             -- denormalized for fast leaderboard queries
  total_diff int,
  place int,
  created_at timestamptz default now(),
  constraint valid_round check (round_number >= 1),
  constraint valid_game check (game_number >= 1)
);

-- Indexes
create index on public.game_results(session_id);
create index on public.game_results(player_id);
create index on public.sessions(date desc);
create index on public.sessions(format_id);

-- Row Level Security
alter table public.tournament_formats enable row level security;
alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.game_results enable row level security;

-- Public read access for all tables
create policy "Public read formats"      on public.tournament_formats for select using (true);
create policy "Public read players"      on public.players            for select using (true);
create policy "Public read sessions"     on public.sessions           for select using (true);
create policy "Public read game_results" on public.game_results       for select using (true);
