import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

import { getItem, removeItem, setItem } from '../../../../shared/core/pstore';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.EXPO_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.EXPO_SUPABASE_ANON_KEY ??
  '';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const SESSION_STORAGE_KEY = '@cloud/supabase.session.v1';

export type PersistedSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
};

const supabaseClient: SupabaseClient | null = cloudEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export const supa = supabaseClient;

let cachedSession: PersistedSession | null = null;
let sessionPromise: Promise<PersistedSession | null> | null = null;

function mapSession(session: Session | null): PersistedSession | null {
  if (!session || !session.user) {
    return null;
  }
  const accessToken = session.access_token;
  const refreshToken = session.refresh_token ?? '';
  if (!accessToken || !refreshToken) {
    return null;
  }
  const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
  return {
    accessToken,
    refreshToken,
    expiresAt,
    userId: session.user.id,
  } satisfies PersistedSession;
}

async function readPersistedSession(): Promise<PersistedSession | null> {
  try {
    const stored = await getItem(SESSION_STORAGE_KEY);
    if (!stored) {
      return null;
    }
    const parsed = JSON.parse(stored) as Partial<PersistedSession>;
    if (
      parsed &&
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      typeof parsed.expiresAt === 'number' &&
      typeof parsed.userId === 'string'
    ) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        expiresAt: parsed.expiresAt,
        userId: parsed.userId,
      } satisfies PersistedSession;
    }
  } catch {
    // ignore corrupt storage and fall back to anonymous sign-in
  }
  return null;
}

async function persistSession(session: PersistedSession | null): Promise<void> {
  if (!session) {
    await removeItem(SESSION_STORAGE_KEY);
    return;
  }
  await setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      userId: session.userId,
    }),
  );
}

async function applyStoredSession(client: SupabaseClient, stored: PersistedSession): Promise<PersistedSession | null> {
  try {
    const { data, error } = await client.auth.setSession({
      access_token: stored.accessToken,
      refresh_token: stored.refreshToken,
    });
    if (!error && data.session) {
      const mapped = mapSession(data.session);
      if (mapped) {
        await persistSession(mapped);
        return mapped;
      }
    }
  } catch {
    // ignore and try refresh
  }

  try {
    const { data, error } = await client.auth.refreshSession({ refresh_token: stored.refreshToken });
    if (!error && data.session) {
      const mapped = mapSession(data.session);
      if (mapped) {
        await persistSession(mapped);
        return mapped;
      }
    }
  } catch {
    // ignore refresh failure
  }

  return null;
}

async function signInAnonymously(client: SupabaseClient): Promise<PersistedSession | null> {
  try {
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.session) {
      return null;
    }
    const mapped = mapSession(data.session);
    if (mapped) {
      await persistSession(mapped);
      return mapped;
    }
  } catch {
    // ignore and fall back to offline mode
  }
  return null;
}

export async function ensureSupabaseSession(): Promise<PersistedSession | null> {
  if (!cloudEnabled || !supabaseClient) {
    return null;
  }
  if (cachedSession && cachedSession.expiresAt > Math.floor(Date.now() / 1000) + 60) {
    return cachedSession;
  }
  if (sessionPromise) {
    return sessionPromise;
  }
  sessionPromise = (async () => {
    const stored = await readPersistedSession();
    if (stored) {
      const applied = await applyStoredSession(supabaseClient, stored);
      if (applied) {
        cachedSession = applied;
        sessionPromise = null;
        return applied;
      }
    }
    const signedIn = await signInAnonymously(supabaseClient);
    cachedSession = signedIn;
    sessionPromise = null;
    return signedIn;
  })();
  return sessionPromise;
}

export async function getCachedUserId(): Promise<string | null> {
  const session = await ensureSupabaseSession();
  return session?.userId ?? null;
}

export async function clearSupabaseSession(): Promise<void> {
  cachedSession = null;
  sessionPromise = null;
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch {
      // ignore sign-out errors
    }
  }
  await persistSession(null);
}

