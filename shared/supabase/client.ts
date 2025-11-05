const URL_KEYS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'API_BASE',
  'EXPO_PUBLIC_API_BASE',
] as const;
const KEY_KEYS = [
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
] as const;

export type SupabaseClientLike = {
  from: (t: string) => any;
  auth?: { getSession?: () => Promise<any> };
};

let overrideClient: SupabaseClientLike | null = null;
let cachedClient: SupabaseClientLike | null = null;

export function setSupabaseClientOverride(candidate: SupabaseClientLike | null): void {
  overrideClient = candidate;
  cachedClient = candidate;
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

/**
 * Lazy fallback for non-browser contexts (Node/tests).
 * Avoids Rollup/Vite resolution by keeping the specifier non-literal.
 */
async function importSupabaseFallback(): Promise<SupabaseClientLike | null> {
  try {
    if (typeof document !== 'undefined') {
      return null;
    }
    const specifier = ['@', 'supabase', '/', 'supabase-js'].join('');
    // @ts-ignore - dynamic specifier intended
    // @vite-ignore
    const mod = await import(specifier);
    const url = firstTruthy(URL_KEYS);
    const key = firstTruthy(KEY_KEYS);
    if (!url || !key) {
      return null;
    }
    return mod.createClient(url, key) as SupabaseClientLike;
  } catch {
    return null;
  }
}

export async function ensureClient(): Promise<SupabaseClientLike | null> {
  if (cachedClient) {
    return cachedClient;
  }
  if (overrideClient) {
    cachedClient = overrideClient;
    return cachedClient;
  }
  cachedClient = await importSupabaseFallback();
  return cachedClient;
}

export function isSupabaseConfigured(): boolean {
  return !!(firstTruthy(URL_KEYS) && firstTruthy(KEY_KEYS));
}
