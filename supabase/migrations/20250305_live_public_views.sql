-- Live spectator public views

create table if not exists public.round_shots (
  round_id uuid not null,
  shot_id text not null,
  hole int not null,
  seq int not null,
  kind text,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint round_shots_pkey primary key (round_id, shot_id)
);

create or replace view public.event_live_public_events as
select
  e.id as event_id,
  e.name,
  e.status,
  coalesce(e.settings ->> 'scoringFormat', 'stroke') as scoring_format,
  nullif(trim((e.settings ->> 'allowancePct')), '')::numeric as allowance_pct
from public.events e;

grant select on public.event_live_public_events to anon;

grant select on public.event_live_public_events to authenticated;

create or replace view public.event_live_round_scores as
select
  s.event_id,
  p.round_id,
  encode(sha256((s.event_id::text || ':' || s.user_id::text)::bytea), 'hex') as spectator_id,
  s.user_id,
  p.display_name,
  p.hcp_index,
  s.hole_no,
  s.gross,
  s.net,
  s.stableford,
  s.to_par,
  s.par,
  s.strokes_received,
  s.playing_handicap,
  s.course_handicap,
  s.ts,
  coalesce(e.settings ->> 'scoringFormat', 'stroke') as format
from public.event_scores s
  join public.event_participants p
    on p.event_id = s.event_id and p.user_id = s.user_id
  join public.events e on e.id = s.event_id;

grant select on public.event_live_round_scores to anon;

grant select on public.event_live_round_scores to authenticated;

create or replace view public.event_live_round_shots as
select
  p.event_id,
  rs.round_id,
  encode(sha256((p.event_id::text || ':' || coalesce(rs.shot_id, rs.round_id::text || ':' || rs.seq::text))::bytea), 'hex')
    as shot_public_id,
  rs.hole,
  rs.seq,
  rs.payload ->> 'club' as club,
  nullif(rs.payload ->> 'carry_m', '')::numeric as carry_m,
  nullif(rs.payload ->> 'playsLikePct', '')::numeric as plays_like_pct,
  nullif(rs.payload ->> 'sg', '')::numeric as strokes_gained,
  nullif(rs.payload -> 'start' ->> 'ts', '')::numeric as start_ts_ms,
  rs.updated_at
from public.round_shots rs
  join public.event_participants p on p.round_id = rs.round_id;

grant select on public.event_live_round_shots to anon;

grant select on public.event_live_round_shots to authenticated;

