export type SupabaseClientLike = {
  from: (t: string) => any;
  auth?: { getUser?: () => Promise<any> };
};

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

function firstTruthy(keys: readonly string[]): string {
  if (typeof process === 'undefined' || !('env' in process)) return '';
  const env = (process as any).env as Record<string, string | undefined>;
  for (const key of keys) {
    const value = env[key];
    if (value) return value;
  }
  return '';
}

let cached: SupabaseClientLike | null = null;
let override: SupabaseClientLike | null = null;

export function setSupabaseClientOverride(c: SupabaseClientLike | null) {
  override = c;
}

export async function loadSupabaseModule(): Promise<typeof import('@supabase/supabase-js') | null> {
  try {
    return await import('@supabase/supabase-js');
  } catch {
    return null;
  }
}

function isEnabled(): boolean {
  return !!(firstTruthy(URL_KEYS) && firstTruthy(KEY_KEYS));
}

export async function ensureClient(): Promise<SupabaseClientLike | null> {
  if (override) return override;
  if (cached) return cached;
  if (!isEnabled()) return null;

  const mod = await loadSupabaseModule();
  if (!mod) return null;
  const url = firstTruthy(URL_KEYS);
  const key = firstTruthy(KEY_KEYS);
  if (!url || !key) return null;

  cached = mod.createClient(url, key) as unknown as SupabaseClientLike;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return isEnabled();
}
