-- USERS: rely on supabase auth (auth.users)

-- ROUNDS (backup of finished or resumable rounds)
create table if not exists rounds (
  id uuid primary key,
  owner uuid not null,
  course_id text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  holes jsonb not null,
  summary jsonb not null,
  updated_at timestamptz not null default now()
);
alter table rounds enable row level security;

-- EVENTS
create table if not exists events (
  id uuid primary key,
  owner uuid not null,
  name text not null,
  course_id text,
  holes jsonb not null,
  format text not null check (format in ('gross','net','stableford')),
  join_code uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);
alter table events enable row level security;

-- Event membership (participant auth binding)
create table if not exists event_members (
  event_id uuid references events(id) on delete cascade,
  member uuid not null,
  constraint pk_event_members primary key(event_id, member)
);
alter table event_members enable row level security;

-- Event results (one row per participant per round)
create table if not exists event_rounds (
  event_id uuid references events(id) on delete cascade,
  participant_id uuid not null,
  participant_name text not null,
  hcp numeric,
  round_id uuid not null,
  holes jsonb not null,
  gross integer not null,
  net integer,
  sg numeric,
  holes_breakdown jsonb,
  owner uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pk_event_rounds primary key(event_id, round_id, participant_id)
);
alter table event_rounds enable row level security;

-- ROUNDS: only owner can CRUD
create policy "rounds_owner_select" on rounds
  for select using (auth.uid() = owner);
create policy "rounds_owner_upsert" on rounds
  for insert with check (auth.uid() = owner);
create policy "rounds_owner_update" on rounds
  for update using (auth.uid() = owner) with check (auth.uid() = owner);

-- EVENTS: owner can CRUD; members can select
create policy "events_owner_select" on events for select using (auth.uid() = owner);
create policy "events_owner_upsert" on events for insert with check (auth.uid() = owner);
create policy "events_owner_update" on events for update using (auth.uid() = owner) with check (auth.uid() = owner);

-- EVENT_MEMBERS: owner can add; members can select their membership
create policy "event_members_owner_insert" on event_members
  for insert with check (auth.uid() = (select owner from events where id = event_id));
create policy "event_members_member_select" on event_members
  for select using (auth.uid() = member);

-- EVENT_ROUNDS: owner OR a member of the event may insert/select; updates only by owner or the same submitter
create policy "event_rounds_insert_member" on event_rounds
  for insert with check (
    exists (select 1 from event_members m where m.event_id = event_id and m.member = auth.uid())
    or exists (select 1 from events e where e.id = event_id and e.owner = auth.uid())
  );

create policy "event_rounds_select_member" on event_rounds
  for select using (
    exists (select 1 from event_members m where m.event_id = event_id and m.member = auth.uid())
    or exists (select 1 from events e where e.id = event_id and e.owner = auth.uid())
  );

create policy "event_rounds_update_owner_or_submitter" on event_rounds
  for update using (
    auth.uid() = owner
    or exists (select 1 from events e where e.id = event_id and e.owner = auth.uid())
  ) with check (true);
