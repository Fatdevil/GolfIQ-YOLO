export type AppVersionInfo = {
  appVersion: string;
  buildNumber: string;
  gitSha: string;
  builtAtUTC: string;
};

const DEFAULT_INFO: AppVersionInfo = {
  appVersion: '0.0.0-dev',
  buildNumber: '0',
  gitSha: 'dev',
  builtAtUTC: new Date(0).toISOString(),
};

type VersionManifest = Partial<Record<keyof AppVersionInfo, unknown>>;

function sanitizeString(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function loadManifest(): VersionManifest | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const raw = require('./version.json') as VersionManifest;
    if (raw && typeof raw === 'object') {
      return raw;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[shared/app/version] falling back to default manifest', error);
    }
  }
  return null;
}

const manifest = loadManifest();

const resolved: AppVersionInfo = {
  appVersion: sanitizeString(manifest?.appVersion, DEFAULT_INFO.appVersion),
  buildNumber: sanitizeString(manifest?.buildNumber, DEFAULT_INFO.buildNumber),
  gitSha: sanitizeString(manifest?.gitSha, DEFAULT_INFO.gitSha),
  builtAtUTC: sanitizeString(manifest?.builtAtUTC, DEFAULT_INFO.builtAtUTC),
};

export const versionInfo: AppVersionInfo = resolved;

export const { appVersion, buildNumber, gitSha, builtAtUTC } = versionInfo;

export function shortGitSha(length = 8): string {
  const normalized = gitSha && typeof gitSha === 'string' ? gitSha.trim() : '';
  if (!normalized) {
    return 'dev';
  }
  if (length <= 0) {
    return normalized;
  }
  return normalized.slice(0, Math.max(1, length));
}

export function describeVersion(): string {
  return `${appVersion} (${shortGitSha(8)})`;
}
