import { vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => {
  const selectResult = { data: [], error: null, status: 200 } as const;
  const selectBuilder = () => {
    const promise = Promise.resolve(selectResult) as any;
    promise.eq = vi.fn(() => promise);
    return promise;
  };

  const from = vi.fn(() => ({
    upsert: vi.fn(async () => ({ data: null, error: null, status: 201 })),
    insert: vi.fn(async () => ({ data: null, error: null, status: 201 })),
    select: vi.fn(() => selectBuilder()),
    delete: vi.fn(() => ({
      in: vi.fn(async () => ({ data: null, error: null })),
      match: vi.fn(async () => ({ data: null, error: null })),
    })),
  }));

  const channel = vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(async () => ({ status: 'SUBSCRIBED' })),
    unsubscribe: vi.fn(async () => undefined),
  }));

  const client = {
    from,
    channel,
    auth: {
      setSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      signInAnonymously: vi.fn(async () => ({ data: { session: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };

  return {
    createClient: vi.fn(() => client),
  };
});

declare module '@supabase/supabase-js' {
  export type Session = unknown;
  export type SupabaseClient = any;
  export type RealtimeChannel = any;
  export const createClient: (...args: any[]) => SupabaseClient;
}

export {};
