alter table if exists public.events
  add column if not exists emoji text,
  add column if not exists created_by uuid default '00000000-0000-0000-0000-000000000000'::uuid not null,
  add column if not exists created_at timestamptz default now() not null;

create table if not exists public.event_codes (
  event_id uuid not null references public.events(id) on delete cascade,
  code text primary key,
  expires_at timestamptz
);

create table if not exists public.event_members (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id text not null,
  role text not null check (role in ('admin','player','spectator')),
  joined_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

