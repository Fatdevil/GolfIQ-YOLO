import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('tempoTrainerBridge', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('is unavailable before a sender is registered', async () => {
    const { isTempoTrainerAvailable } = await import('@app/watch/tempoTrainerBridge');
    expect(isTempoTrainerAvailable()).toBe(false);
  });

  it('becomes available after registering a sender', async () => {
    const { isTempoTrainerAvailable, registerTempoTrainerSender } = await import(
      '@app/watch/tempoTrainerBridge'
    );
    registerTempoTrainerSender(vi.fn());
    expect(isTempoTrainerAvailable()).toBe(true);
  });

  it('logs and ignores activation/deactivation when no sender is registered', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { sendTempoTrainerActivation, sendTempoTrainerDeactivation } = await import(
      '@app/watch/tempoTrainerBridge'
    );

    sendTempoTrainerActivation({
      targetRatio: 3,
      tolerance: 0.2,
      targetBackswingMs: 900,
      targetDownswingMs: 300,
    });
    sendTempoTrainerDeactivation();

    expect(debugSpy).toHaveBeenCalled();
  });

  it('invokes the sender for activation and deactivation', async () => {
    const {
      registerTempoTrainerSender,
      sendTempoTrainerActivation,
      sendTempoTrainerDeactivation,
    } = await import('@app/watch/tempoTrainerBridge');
    const handler = vi.fn();
    registerTempoTrainerSender(handler);

    sendTempoTrainerActivation({
      targetRatio: 3,
      tolerance: 0.2,
      targetBackswingMs: 900,
      targetDownswingMs: 300,
    });
    sendTempoTrainerDeactivation();

    expect(handler).toHaveBeenNthCalledWith(1, {
      type: 'tempoTrainer.activate',
      targetRatio: 3,
      tolerance: 0.2,
      targetBackswingMs: 900,
      targetDownswingMs: 300,
    });
    expect(handler).toHaveBeenNthCalledWith(2, { type: 'tempoTrainer.deactivate' });
  });

  it('dispatches result listeners to subscribers', async () => {
    const { emitTempoTrainerResult, subscribeToTempoTrainerResults } = await import(
      '@app/watch/tempoTrainerBridge'
    );
    const listener = vi.fn();
    const unsubscribe = subscribeToTempoTrainerResults(listener);

    emitTempoTrainerResult({ type: 'tempoTrainer.result', ratio: 3.1 });

    expect(listener).toHaveBeenCalledWith({ type: 'tempoTrainer.result', ratio: 3.1 });

    unsubscribe();
  });
});
