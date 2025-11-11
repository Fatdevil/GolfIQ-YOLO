import { describe, expect, it } from 'vitest';

import { buildHlsConfig } from '@web/player/hlsConfig';

describe('buildHlsConfig', () => {
  it('returns VOD configuration with tuned defaults', () => {
    const config = buildHlsConfig({ live: false });
    expect(config.lowLatencyMode).toBe(false);
    expect(config.backBufferLength).toBe(30);
    expect(config.maxBufferLength).toBe(20);
    expect(config.abrEwmaDefaultEstimate).toBe(5_000_000);
    expect(config.enableWorker).toBe(true);
    expect(config.progressive).toBe(true);
    expect('initialLiveManifestSize' in config).toBe(false);
  });

  it('enables live specific flags', () => {
    const config = buildHlsConfig({ live: true });
    expect(config.lowLatencyMode).toBe(true);
    expect(config.maxBufferLength).toBe(10);
    expect(config.initialLiveManifestSize).toBe(1);
  });
});
