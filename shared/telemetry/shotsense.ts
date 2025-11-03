export const recordAutoEvent = (event: { kind: 'enqueue' | 'confirm' | 'dismiss'; strength?: number }): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[telemetry:auto]', event);
  }
};
