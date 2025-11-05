import { createClient } from '@supabase/supabase-js';
import { setSupabaseClientOverride } from '@shared/supabase/client';

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.PUBLIC_SUPABASE_URL ||
  '';
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY ||
  '';

export function bootstrapSupabase(): void {
  if (!url || !key) {
    return;
  }
  const client = createClient(url, key);
  setSupabaseClientOverride(client as any);
}
