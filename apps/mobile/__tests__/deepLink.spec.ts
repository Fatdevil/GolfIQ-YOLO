import { describe, expect, it } from 'vitest';

import { getStateFromPath } from '@react-navigation/native';

import linking from '@app/linking';

describe('deep link handling', () => {
  it('parses golfiq://join/ABC1234', () => {
    const state = getStateFromPath('golfiq://join/ABC1234', linking.config);
    expect(state).toBeTruthy();
    const [route] = state?.routes ?? [];
    expect(route?.name).toBe('EventJoin');
    expect(route?.params).toMatchObject({ code: 'ABC1234' });
  });
});
