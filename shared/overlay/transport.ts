export type OverlaySnapshotMeta = {
  club?: string;
  p50_m?: number;
};

export type OverlaySnapshotV1 = {
  v: 1;
  size: { w: number; h: number };
  ring: Array<[number, number]>;
  corridor: Array<[number, number]>;
  labelsAllowed: boolean;
  meta?: OverlaySnapshotMeta;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
};

const normalizePoints = (
  points: { x: number; y: number }[],
  size: { w: number; h: number },
): Array<[number, number]> => {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }
  const width = Number.isFinite(size.w) && size.w > 0 ? size.w : 1;
  const height = Number.isFinite(size.h) && size.h > 0 ? size.h : 1;
  return points.map((point) => {
    const px = typeof point?.x === 'number' && Number.isFinite(point.x) ? point.x : 0;
    const py = typeof point?.y === 'number' && Number.isFinite(point.y) ? point.y : 0;
    const nx = clamp01(px / width);
    const ny = clamp01(py / height);
    return [nx, ny];
  });
};

const sanitizeSize = (size: { w: number; h: number }): { w: number; h: number } => ({
  w: Number.isFinite(size.w) && size.w > 0 ? size.w : 1,
  h: Number.isFinite(size.h) && size.h > 0 ? size.h : 1,
});

export function normalizeOverlay(
  ring: { x: number; y: number }[],
  corridor: { x: number; y: number }[],
  size: { w: number; h: number },
  labelsAllowed: boolean,
  meta?: OverlaySnapshotMeta,
): OverlaySnapshotV1 {
  const normalizedSize = sanitizeSize(size);
  const normalizedRing = normalizePoints(ring, normalizedSize);
  const normalizedCorridor = normalizePoints(corridor, normalizedSize);

  const snapshot: OverlaySnapshotV1 = {
    v: 1,
    size: normalizedSize,
    ring: normalizedRing,
    corridor: normalizedCorridor,
    labelsAllowed: Boolean(labelsAllowed),
  };

  if (labelsAllowed && meta && (meta.club || Number.isFinite(meta.p50_m))) {
    const nextMeta: OverlaySnapshotMeta = {};
    if (typeof meta.club === 'string') {
      nextMeta.club = meta.club;
    }
    if (Number.isFinite(meta.p50_m)) {
      nextMeta.p50_m = Number(meta.p50_m);
    }
    if (Object.keys(nextMeta).length > 0) {
      snapshot.meta = nextMeta;
    }
  }

  return snapshot;
}

export function hashOverlaySnapshot(snapshot: OverlaySnapshotV1): string {
  const json = JSON.stringify(snapshot);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
