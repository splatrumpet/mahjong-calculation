create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  played_on date not null,
  game_number integer not null check (game_number > 0),
  starting_points integer not null default 25000,
  return_points integer not null default 30000,
  rank_points integer[] not null default array[50, 10, -10, -30],
  created_at timestamptz not null default now(),
  unique (played_on, game_number)
);

create table if not exists game_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  seat text not null check (seat in ('self', 'right', 'top', 'left')),
  player_name text not null,
  final_points integer not null,
  is_starting_dealer boolean not null default false,
  rank integer not null check (rank between 1 and 4),
  point_diff_score numeric(6, 1) not null,
  rank_point integer not null,
  oka numeric(6, 1) not null,
  total_score numeric(6, 1) not null,
  created_at timestamptz not null default now()
);

create index if not exists game_results_game_id_idx on game_results(game_id);
create index if not exists games_played_on_idx on games(played_on desc, game_number desc);
