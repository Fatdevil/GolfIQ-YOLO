import { describe, expect, it, vi } from 'vitest';

import { measureStart } from '@web/metrics/playerTiming';

describe('measureStart', () => {
  it('emits play_start_ms when video begins playing', () => {
    const listeners = new Map<string, () => void>();
    const video = {
      addEventListener: (event: string, handler: () => void) => {
        listeners.set(event, handler);
      },
      removeEventListener: (event: string) => {
        listeners.delete(event);
      },
    } as unknown as HTMLVideoElement;
    const emit = vi.fn();
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValueOnce(100).mockReturnValueOnce(380);

    const cleanup = measureStart(video, { live: false, src: 'https://cdn.test/master.m3u8' }, emit);

    listeners.get('playing')?.();

    expect(emit).toHaveBeenCalledTimes(1);
    const payload = emit.mock.calls[0][0];
    expect(payload.play_start_ms).toBe(280);
    expect(payload.live).toBe(false);
    expect(payload.src).toContain('master.m3u8');

    cleanup();
    nowSpy.mockRestore();
  });
});
