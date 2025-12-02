import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SETTINGS,
  loadCaddieSettings,
  saveCaddieSettings,
  type CaddieSettings,
} from '@app/caddie/caddieSettingsStorage';
import * as storage from '@app/storage/asyncStorage';

const settings: CaddieSettings = {
  stockShape: 'fade',
  riskProfile: 'aggressive',
};

describe('caddieSettingsStorage', () => {
  beforeEach(() => {
    vi.spyOn(storage, 'getItem').mockResolvedValue(null);
    vi.spyOn(storage, 'setItem').mockResolvedValue();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default settings when storage is empty', async () => {
    const loaded = await loadCaddieSettings();
    expect(loaded).toEqual(DEFAULT_SETTINGS);
  });

  it('saves and loads settings round-trip', async () => {
    await saveCaddieSettings(settings);
    expect(storage.setItem).toHaveBeenCalledWith(expect.any(String), JSON.stringify(settings));

    vi.mocked(storage.getItem).mockResolvedValueOnce(JSON.stringify(settings));
    const loaded = await loadCaddieSettings();
    expect(loaded).toEqual(settings);
  });

  it('falls back to default on corrupt data', async () => {
    vi.mocked(storage.getItem).mockResolvedValueOnce('not-json');
    const loaded = await loadCaddieSettings();
    expect(loaded).toEqual(DEFAULT_SETTINGS);
    expect(console.warn).toHaveBeenCalled();
  });
});
