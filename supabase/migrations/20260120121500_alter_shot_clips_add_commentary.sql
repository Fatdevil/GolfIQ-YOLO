alter table public.shot_clips
  add column if not exists ai_title text,
  add column if not exists ai_summary text,
  add column if not exists ai_tts_url text;
