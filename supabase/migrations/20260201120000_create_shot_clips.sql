create type if not exists public.clip_status as enum ('queued','processing','ready','failed');
create type if not exists public.clip_visibility as enum ('event','friends','public');

create table if not exists public.shot_clips (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  player_id uuid not null,
  round_id uuid,
  hole int check (hole is null or hole between 1 and 18),
  status public.clip_status not null default 'queued',
  src_uri text,
  hls_url text,
  mp4_url text,
  thumb_url text,
  duration_ms int,
  fingerprint text,
  visibility public.clip_visibility not null default 'event',
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_clips_event_status_created
  on public.shot_clips (event_id, status, created_at desc);
