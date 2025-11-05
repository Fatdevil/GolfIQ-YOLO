type PrevRow = { round_revision?: number | null; scores_hash?: string | null } | null;

export function makeFakeSupabase(opts: { prev?: PrevRow; upsertOk?: boolean } = {}) {
  const { prev = null, upsertOk = true } = opts;

  // Minimal chainable query builder to mimic @supabase/supabase-js v2
  const builder: any = {
    _table: '',
    _select: '',
    select: function (cols: string) {
      this._select = cols;
      return this; // keep chain
    },
    match: function (_: Record<string, unknown>) {
      return this; // ignore filters but keep chain semantics
    },
    eq: function (_: string, __: unknown) {
      return this; // support eq() style too
    },
    maybeSingle: async () => ({ data: prev, error: null }),
    single: async () => ({ data: prev, error: null }),
    upsert: async (_row: unknown, _opts?: unknown) =>
      upsertOk ? { data: null, error: null } : { data: null, error: new Error('upsert failed') },
  };

  return {
    from: (_table: string) => Object.assign({}, builder, { _table }),
  } as const;
}
