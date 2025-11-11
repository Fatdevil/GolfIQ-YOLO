export function buildHlsConfig({ live }: { live: boolean }) {
  return {
    lowLatencyMode: live,
    backBufferLength: 30,
    maxBufferLength: live ? 10 : 20,
    startPosition: -1,
    capLevelOnFPSDrop: true,
    fragLoadingMaxRetry: 2,
    manifestLoadingMaxRetry: 2,
    enableWorker: true,
    progressive: true,
    abrEwmaDefaultEstimate: 5_000_000,
    ...(live ? { initialLiveManifestSize: 1 } : {}),
  } as const;
}
