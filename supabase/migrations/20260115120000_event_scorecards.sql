create table if not exists public.event_scorecards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  scorecard_id text not null,
  player_name text not null,
  member_id text,
  hcp_index numeric,
  course_handicap int,
  playing_handicap int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, scorecard_id)
);

create table if not exists public.event_scorecard_holes (
  id bigserial primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  scorecard_id text not null,
  hole int not null check (hole between 1 and 36),
  gross int not null,
  net int,
  stableford int,
  to_par int,
  par int,
  strokes_received int,
  playing_handicap int,
  course_handicap int,
  fingerprint text,
  revision int default 0,
  updated_at timestamptz not null default now(),
  foreign key (event_id, scorecard_id) references public.event_scorecards(event_id, scorecard_id) on delete cascade,
  unique (scorecard_id, hole)
);

create unique index if not exists event_scorecard_holes_scorecard_hole_idx
  on public.event_scorecard_holes (scorecard_id, hole);
