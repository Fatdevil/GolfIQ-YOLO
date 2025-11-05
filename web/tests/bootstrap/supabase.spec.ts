import { describe, expect, it } from 'vitest';

import { bootstrapSupabase } from '../../src/bootstrap/supabase';

describe('supabase bootstrap', () => {
  it('does not throw when env vars are missing', () => {
    expect(() => bootstrapSupabase()).not.toThrow();
  });
});
