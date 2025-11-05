-- Cloud sync v1.1: add revision/hash tracking to event scores
alter table if exists public.event_scores
  add column if not exists round_revision bigint;

alter table if exists public.event_scores
  add column if not exists scores_hash text;
