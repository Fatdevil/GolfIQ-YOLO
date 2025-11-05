import { describe, expect, it } from 'vitest';

import { loadSupabaseModule } from '../../../shared/supabase/client';

describe('supabase client shim', () => {
  it('loads module or returns null gracefully', async () => {
    const mod = await loadSupabaseModule();
    expect([null, 'object']).toContain(mod === null ? null : typeof mod);
  });
});
