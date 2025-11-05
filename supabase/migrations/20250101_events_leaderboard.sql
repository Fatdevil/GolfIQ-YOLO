-- events
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  start_at timestamptz default now(),
  status text default 'open'
);

-- participants
create table if not exists public.event_participants (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  hcp_index numeric,
  round_id uuid,
  primary key (event_id, user_id)
);

-- scores
create table if not exists public.event_scores (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null,
  hole_no int not null,
  gross int not null,
  net int not null,
  to_par int not null,
  ts timestamptz not null default now(),
  primary key (event_id, user_id, hole_no)
);
