export type SupabaseClientLike = {
  from: (table: string) => any;
  auth?: { getUser?: () => Promise<{ data?: { user?: { id?: string } } }> };
};

// For tests we can inject a stubbed client.
let injected: SupabaseClientLike | null = null;
export function setSupabaseClientForTests(c: SupabaseClientLike | null) {
  injected = c;
}

const URL_KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
] as const;
const KEY_KEYS = [
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
] as const;

function envPick(keys: readonly string[]) {
  if (typeof process === 'undefined' || !('env' in process)) return '';
  const env = (process as any).env as Record<string, string | undefined>;
  for (const k of keys) if (env[k]) return env[k]!;
  return '';
}

let cached: SupabaseClientLike | null = null;

export async function getSupabase(): Promise<SupabaseClientLike | null> {
  if (injected) return injected;
  if (cached) return cached;
  const url = envPick(URL_KEYS);
  const key = envPick(KEY_KEYS);
  if (!url || !key) return null;
  const mod = await import('@supabase/supabase-js');
  cached = mod.createClient(url, key) as unknown as SupabaseClientLike;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return !!(envPick(URL_KEYS) && envPick(KEY_KEYS));
}
