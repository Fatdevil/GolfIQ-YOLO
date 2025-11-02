import type { PostgrestError } from '@supabase/supabase-js';

import { supa } from './supabase';

export class CloudSyncError extends Error {
  table: string;
  op: 'insert' | 'update' | 'upsert' | 'select' | 'delete';
  status?: number;
  code?: string;

  constructor(params: {
    table: string;
    op: CloudSyncError['op'];
    message: string;
    status?: number;
    code?: string;
  }) {
    super(params.message);
    this.table = params.table;
    this.op = params.op;
    this.status = params.status;
    this.code = params.code;
  }
}

type UpsertOpts = { onConflict?: string; returning?: 'minimal' | 'representation' };

type SupabaseLike = {
  from<T = any>(table: string): {
    upsert(
      row: Record<string, unknown>,
      opts?: { onConflict?: string; returning?: 'minimal' | 'representation' },
    ): Promise<{ data: T[] | null; error: PostgrestError | null; status: number | null }>;
    insert(
      row: Record<string, unknown>,
    ): Promise<{ data: T[] | null; error: PostgrestError | null; status: number | null }>;
    select(columns?: string): SelectBuilder<T>;
  };
};

type SelectBuilder<T> = Promise<{ data: T[] | null; error: PostgrestError | null; status: number | null }> & {
  eq: (column: string, value: unknown) => SelectBuilder<T>;
};

let activeClient: SupabaseLike | null = (supa as unknown as SupabaseLike | null);

export function __setSupabaseClientForTests(client: SupabaseLike | null): void {
  activeClient = client ?? (supa as unknown as SupabaseLike | null);
}

function requireClient(table: string, op: CloudSyncError['op']): SupabaseLike {
  if (activeClient) {
    return activeClient;
  }
  throw new CloudSyncError({
    table,
    op,
    message: 'Supabase client unavailable',
    status: 503,
  });
}

function normalizeError(
  table: string,
  op: CloudSyncError['op'],
  error: PostgrestError | null,
  status: number | null,
): CloudSyncError {
  return new CloudSyncError({
    table,
    op,
    message: error?.message ?? 'Unknown Supabase error',
    status: typeof status === 'number' ? status : undefined,
    code: (error as unknown as { code?: string } | null)?.code,
  });
}

export async function upsertOrThrow<T = any>(
  table: string,
  row: Record<string, unknown>,
  opts: UpsertOpts = { returning: 'minimal' },
): Promise<T[] | null> {
  const client = requireClient(table, 'upsert');
  const { data, error, status } = await client
    .from<T>(table)
    .upsert(row, { onConflict: opts.onConflict, returning: opts.returning ?? 'minimal' });
  if (error) {
    throw normalizeError(table, 'upsert', error, status);
  }
  return data ?? null;
}

export async function insertOrThrow<T = any>(table: string, row: Record<string, unknown>): Promise<T[] | null> {
  const client = requireClient(table, 'insert');
  const { data, error, status } = await client.from<T>(table).insert(row);
  if (error) {
    throw normalizeError(table, 'insert', error, status);
  }
  return data ?? null;
}

export async function selectOrThrow<T = any>(
  table: string,
  eq: Record<string, unknown>,
): Promise<T[] | null> {
  const client = requireClient(table, 'select');
  let query = client.from<T>(table).select('*');
  Object.entries(eq).forEach(([key, value]) => {
    if (typeof (query as SelectBuilder<T>).eq === 'function') {
      query = (query as SelectBuilder<T>).eq(key, value);
    }
  });
  const { data, error, status } = await query;
  if (error) {
    throw normalizeError(table, 'select', error, status);
  }
  return data ?? null;
}
