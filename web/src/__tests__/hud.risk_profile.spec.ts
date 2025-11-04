import { describe, expect, it, vi } from 'vitest';

import type { CaddieHudVM } from '../../../shared/caddie/selectors';
import { withRiskProfile } from '../../../shared/caddie/selectors';

describe('HUD risk profile context propagation', () => {
  it('threads riskProfile into the HUD VM context when toggled', () => {
    const baseContext: CaddieHudVM['context'] = { wind_mps: 3 };
    const builder = vi.fn((profile: 'conservative' | 'neutral' | 'aggressive') =>
      withRiskProfile(baseContext, profile),
    );

    const neutral = builder('neutral');
    const aggressive = builder('aggressive');

    expect(neutral).toMatchObject({ wind_mps: 3, riskProfile: 'neutral' });
    expect(aggressive).toMatchObject({ wind_mps: 3, riskProfile: 'aggressive' });
    expect(aggressive).not.toBe(neutral);
    expect(builder).toHaveBeenCalledTimes(2);
  });
});
