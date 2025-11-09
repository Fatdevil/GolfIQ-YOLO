create type if not exists public.event_gross_net as enum ('gross', 'net');

create table if not exists public.event_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  gross_net public.event_gross_net not null default 'net',
  tv_flags jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists event_settings_updated_at_idx on public.event_settings(updated_at desc);
