declare module '@supabase/supabase-js' {
  export type SupabaseClient = {
    from: (table: string) => {
      upsert: (payload: unknown, options?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      insert: (payload: unknown) => Promise<{ data: unknown; error: unknown }>;
      select: (...args: unknown[]) => any;
      eq?: (...args: unknown[]) => any;
    };
    channel: (name: string) => RealtimeChannel;
  };

  export type RealtimeChannel = {
    on: (...args: unknown[]) => RealtimeChannel;
    subscribe: (...args: unknown[]) => Promise<{ status?: string } | undefined>;
    unsubscribe: () => Promise<void>;
  };

  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): SupabaseClient;
}
