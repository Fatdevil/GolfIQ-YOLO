export type HoleRef = { id: string; v: number; len: number };

export type CourseBundleManifest = {
  id: string;
  v: number;
  etag?: string;
  updatedAt: number;
  ttlSec: number;
  sha256?: string;
  sizeBytes: number;
  holes: HoleRef[];
};

export type BundleStatus = 'fresh' | 'stale' | 'missing' | 'invalid' | 'error';

export type BundleResult = {
  status: BundleStatus;
  manifest?: CourseBundleManifest;
  path?: string;
  reason?: string;
};
