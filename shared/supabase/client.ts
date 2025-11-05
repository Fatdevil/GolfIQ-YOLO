const ENV_URL_KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'API_BASE',
  'EXPO_PUBLIC_API_BASE',
] as const;
const ENV_KEY_KEYS = [
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
] as const;

export type SupabaseClientLike = {
  from: (t: string) => any;
  auth?: { getUser?: () => Promise<any> };
};

let override: SupabaseClientLike | null = null;
let cached: SupabaseClientLike | null = null;

export function setSupabaseClientOverride(candidate: SupabaseClientLike | null): void {
  override = candidate;
}

function firstTruthy(keys: readonly string[]): string {
  const env = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env ?? {};
  for (const key of keys) {
    const value = env[key];
    if (value != null && value !== '') {
      return String(value);
    }
  }
  return '';
}

export async function loadSupabaseModule(): Promise<typeof import('@supabase/supabase-js') | null> {
  try {
    return await import('@supabase/supabase-js');
  } catch {
    return null;
  }
}

export async function ensureClient(): Promise<SupabaseClientLike | null> {
  if (override) return override;
  if (cached) return cached;

  const url = firstTruthy(ENV_URL_KEYS);
  const key = firstTruthy(ENV_KEY_KEYS);
  if (!url || !key) {
    return null;
  }

  const mod = await loadSupabaseModule();
  if (!mod) {
    return null;
  }

  cached = mod.createClient(url, key) as unknown as SupabaseClientLike;
  return cached;
}

export function isSupabaseConfigured(): boolean {
  return !!(firstTruthy(ENV_URL_KEYS) && firstTruthy(ENV_KEY_KEYS));
}
