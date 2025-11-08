-- HUD snapshots table (idempotent)
create table if not exists public.hud_snapshots (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  hole_id integer not null,
  ts timestamptz not null default now(),
  version text not null,
  device_id text,
  fp_hash text not null,
  payload_jsonb jsonb not null,
  ttl_at timestamptz generated always as (
    ts + (coalesce(current_setting('app.hud_snapshot_ttl_days', true)::int, 30) || ' days')::interval
  ) stored
);

create index if not exists idx_hud_snapshots_round_hole_ts on public.hud_snapshots (round_id, hole_id, ts);
create unique index if not exists uidx_hud_snapshots_fphash on public.hud_snapshots (fp_hash);

-- Optional: lightweight purge helper (can be scheduled externally)
create or replace function public.purge_hud_snapshots() returns void language sql as
$$ delete from public.hud_snapshots where ttl_at < now(); $$;
