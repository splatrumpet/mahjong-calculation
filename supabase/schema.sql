create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists group_memberships (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (group_id, email)
);

create table if not exists group_players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text not null,
  is_guest boolean not null default false,
  created_at timestamptz not null default now(),
  check ((is_guest = true and user_id is null) or (is_guest = false and user_id is not null)),
  unique (group_id, display_name),
  unique (group_id, user_id)
);

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  played_on date not null,
  game_number integer not null check (game_number > 0),
  starting_points integer not null default 25000,
  return_points integer not null default 30000,
  rank_points integer[] not null default array[50, 10, -10, -30],
  created_at timestamptz not null default now(),
  unique (group_id, played_on, game_number)
);

create table if not exists game_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_user_id uuid references auth.users(id) on delete set null,
  guest_player_id uuid references group_players(id) on delete set null,
  player_name text not null,
  final_points integer not null,
  is_starting_dealer boolean not null default false,
  starting_wind text not null check (starting_wind in ('east', 'south', 'west', 'north')),
  rank integer not null check (rank between 1 and 4),
  point_diff_score numeric(6, 1) not null,
  rank_point integer not null,
  oka numeric(6, 1) not null,
  total_score numeric(6, 1) not null,
  created_at timestamptz not null default now(),
  check (player_user_id is not null or guest_player_id is not null)
);

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_memberships enable row level security;
alter table group_invitations enable row level security;
alter table group_players enable row level security;
alter table games enable row level security;
alter table game_results enable row level security;

drop policy if exists "Users can upsert own profile" on profiles;
drop policy if exists "Users can update own profile" on profiles;
drop policy if exists "Users can view own profile" on profiles;
drop policy if exists "Users can create groups" on groups;
drop policy if exists "Members can view groups" on groups;
drop policy if exists "Owners can update groups" on groups;
drop policy if exists "Owners can create memberships" on group_memberships;
drop policy if exists "Users can view their own memberships" on group_memberships;
drop policy if exists "Invited users can join groups" on group_memberships;
drop policy if exists "Members can create invitations" on group_invitations;
drop policy if exists "Invited users can view invitations" on group_invitations;
drop policy if exists "Invited users can update invitations" on group_invitations;
drop policy if exists "Members can create group players" on group_players;
drop policy if exists "Members can view group players" on group_players;
drop policy if exists "Members can delete guest players" on group_players;
drop policy if exists "Members can create games" on games;
drop policy if exists "Members can view games" on games;
drop policy if exists "Members can create game results" on game_results;
drop policy if exists "Members can view game results" on game_results;
drop policy if exists "Members can update game results" on game_results;

create policy "Users can upsert own profile" on profiles
  for insert with check (id = auth.uid());

create policy "Users can update own profile" on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid());

create policy "Users can view own profile" on profiles
  for select using (id = auth.uid());

create policy "Users can create groups" on groups
  for insert with check (auth.uid() = owner_id);

create policy "Members can view groups" on groups
  for select using (
    exists (
      select 1 from group_memberships
      where group_memberships.group_id = groups.id
        and group_memberships.user_id = auth.uid()
    )
    or owner_id = auth.uid()
  );

create policy "Owners can update groups" on groups
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners can create memberships" on group_memberships
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from groups
      where groups.id = group_memberships.group_id
        and groups.owner_id = auth.uid()
    )
  );

create policy "Invited users can join groups" on group_memberships
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from group_invitations
      where group_invitations.group_id = group_memberships.group_id
        and group_invitations.email = lower(auth.jwt() ->> 'email')
        and group_invitations.status = 'pending'
    )
  );

create policy "Users can view their own memberships" on group_memberships
  for select using (user_id = auth.uid());

create policy "Members can create invitations" on group_invitations
  for insert with check (
    invited_by = auth.uid()
    and exists (
      select 1 from group_memberships
      where group_memberships.group_id = group_invitations.group_id
        and group_memberships.user_id = auth.uid()
    )
  );

create policy "Invited users can view invitations" on group_invitations
  for select using (email = lower(auth.jwt() ->> 'email'));

create policy "Invited users can update invitations" on group_invitations
  for update using (email = lower(auth.jwt() ->> 'email'))
  with check (email = lower(auth.jwt() ->> 'email'));

create policy "Members can create group players" on group_players
  for insert with check (
    exists (
      select 1 from group_memberships
      where group_memberships.group_id = group_players.group_id
        and group_memberships.user_id = auth.uid()
    )
    and (is_guest = true or user_id = auth.uid())
  );

create policy "Members can view group players" on group_players
  for select using (
    exists (
      select 1 from group_memberships
      where group_memberships.group_id = group_players.group_id
        and group_memberships.user_id = auth.uid()
    )
  );

create policy "Members can delete guest players" on group_players
  for delete using (
    is_guest = true
    and exists (
      select 1 from group_memberships
      where group_memberships.group_id = group_players.group_id
        and group_memberships.user_id = auth.uid()
    )
  );

create policy "Members can create games" on games
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from group_memberships
      where group_memberships.group_id = games.group_id
        and group_memberships.user_id = auth.uid()
    )
  );

create policy "Members can view games" on games
  for select using (
    exists (
      select 1 from group_memberships
      where group_memberships.group_id = games.group_id
        and group_memberships.user_id = auth.uid()
    )
  );

create policy "Members can create game results" on game_results
  for insert with check (
    exists (
      select 1 from games
      join group_memberships on group_memberships.group_id = games.group_id
      where games.id = game_results.game_id
        and group_memberships.user_id = auth.uid()
    )
  );

create policy "Members can view game results" on game_results
  for select using (
    exists (
      select 1 from games
      join group_memberships on group_memberships.group_id = games.group_id
      where games.id = game_results.game_id
        and group_memberships.user_id = auth.uid()
    )
  );

create policy "Members can update game results" on game_results
  for update using (
    exists (
      select 1 from games
      join group_memberships on group_memberships.group_id = games.group_id
      where games.id = game_results.game_id
        and group_memberships.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from games
      join group_memberships on group_memberships.group_id = games.group_id
      where games.id = game_results.game_id
        and group_memberships.user_id = auth.uid()
    )
  );

create index if not exists group_memberships_user_id_idx on group_memberships(user_id);
create index if not exists group_invitations_email_idx on group_invitations(email, status);
create index if not exists group_players_group_id_idx on group_players(group_id);
create index if not exists games_group_id_idx on games(group_id);
create index if not exists games_played_on_idx on games(group_id, played_on desc, game_number desc);
create index if not exists game_results_game_id_idx on game_results(game_id);
create index if not exists game_results_player_user_id_idx on game_results(player_user_id);
create index if not exists game_results_guest_player_id_idx on game_results(guest_player_id);
