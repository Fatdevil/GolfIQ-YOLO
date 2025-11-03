const isDev = (): boolean => {
  try {
    const rnFlag = (globalThis as any)?.__DEV__;
    if (typeof rnFlag === 'boolean') {
      return rnFlag;
    }

    const env = (globalThis as any)?.process?.env?.NODE_ENV;
    return env !== 'production';
  } catch {
    return false;
  }
};

export const recordAutoEvent = (event: { kind: 'enqueue' | 'confirm' | 'dismiss'; strength?: number }): void => {
  if (!isDev()) {
    return;
  }

  // eslint-disable-next-line no-console
  console.log('[telemetry:auto]', event);
};
