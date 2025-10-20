import { toLocalENU } from '@shared/arhud/geo';

export type ParsedRoundHole = {
  holeNo: number;
  par: number;
  score: number;
  strokes: number;
  fir: boolean | null;
  gir: boolean | null;
};

export type ParsedRound = {
  id: string;
  courseId: string;
  tee?: string;
  startedAt: number;
  finished: boolean;
  totalPar: number;
  totalScore: number;
  relative: number;
  firHit: number;
  firEligible: number;
  girHit: number;
  girEligible: number;
  holes: ParsedRoundHole[];
};

type JsonRecord = Record<string, unknown>;

type ShotLike = {
  club: string;
  base_m: number;
  playsLike_m: number;
  carry_m?: number;
  pin: { lat: number; lon: number };
  land?: { lat: number; lon: number };
};

type HoleLike = {
  holeNo: number;
  par: number;
  score?: number;
  shots: ShotLike[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseShot(raw: unknown): ShotLike | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as JsonRecord;
  const club = typeof record.club === 'string' && record.club.trim() ? record.club.trim() : 'UNK';
  const base = Number(record.base_m);
  const playsLike = Number(record.playsLike_m ?? record.base_m);
  const pinRaw = record.pin;
  if (!pinRaw || typeof pinRaw !== 'object') {
    return null;
  }
  const pinLat = Number((pinRaw as JsonRecord).lat);
  const pinLon = Number((pinRaw as JsonRecord).lon);
  if (!Number.isFinite(pinLat) || !Number.isFinite(pinLon)) {
    return null;
  }
  const shot: ShotLike = {
    club,
    base_m: Number.isFinite(base) ? base : 0,
    playsLike_m: Number.isFinite(playsLike) ? playsLike : 0,
    pin: { lat: pinLat, lon: pinLon },
  };
  const carry = Number(record.carry_m);
  if (Number.isFinite(carry)) {
    shot.carry_m = carry;
  }
  const landRaw = record.land;
  if (landRaw && typeof landRaw === 'object') {
    const landLat = Number((landRaw as JsonRecord).lat);
    const landLon = Number((landRaw as JsonRecord).lon);
    if (Number.isFinite(landLat) && Number.isFinite(landLon)) {
      shot.land = { lat: landLat, lon: landLon };
    }
  }
  return shot;
}

function parseHole(raw: unknown): HoleLike | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as JsonRecord;
  const holeNo = Number(record.holeNo);
  const par = Number(record.par);
  if (!Number.isFinite(holeNo) || !Number.isFinite(par)) {
    return null;
  }
  const shotsRaw = Array.isArray(record.shots) ? record.shots : [];
  const shots: ShotLike[] = [];
  for (const shotRaw of shotsRaw) {
    const shot = parseShot(shotRaw);
    if (shot) {
      shots.push(shot);
    }
  }
  const hole: HoleLike = {
    holeNo: Math.max(1, Math.floor(holeNo)),
    par: Math.max(3, Math.min(6, Math.floor(par))),
    shots,
  };
  if (isFiniteNumber(record.score) && Number(record.score) > 0) {
    hole.score = Math.floor(Number(record.score));
  }
  return hole;
}

function landingDistance(shot: ShotLike): number | null {
  if (!shot.land) {
    return null;
  }
  const delta = toLocalENU(shot.pin, shot.land);
  return Math.hypot(delta.x, delta.y);
}

function fairwayHeuristic(shot: ShotLike): boolean {
  const carry = isFiniteNumber(shot.carry_m)
    ? shot.carry_m
    : isFiniteNumber(shot.playsLike_m)
      ? shot.playsLike_m
      : shot.base_m;
  if (!Number.isFinite(carry) || carry <= 0) {
    return false;
  }
  const club = shot.club.toUpperCase();
  const minCarry = club.includes('D') || club.includes('W') ? 160 : 130;
  const maxCarry = 320;
  return carry >= minCarry && carry <= maxCarry;
}

function strokesUntilGreen(shots: ShotLike[]): number | null {
  for (let index = 0; index < shots.length; index += 1) {
    const distance = landingDistance(shots[index]);
    if (distance !== null && distance <= 12) {
      return index + 1;
    }
  }
  return null;
}

export function parseRound(input: unknown): ParsedRound {
  if (!input || typeof input !== 'object') {
    throw new Error('round_run.json must be a JSON object');
  }
  const record = input as JsonRecord;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : null;
  const courseId =
    typeof record.courseId === 'string' && record.courseId.trim() ? record.courseId.trim() : null;
  if (!id || !courseId) {
    throw new Error('Round payload missing id or courseId');
  }
  const startedAt = Number(record.startedAt);
  if (!Number.isFinite(startedAt)) {
    throw new Error('Round payload missing startedAt');
  }
  const holesRaw = Array.isArray(record.holes) ? record.holes : [];
  if (!holesRaw.length) {
    throw new Error('Round payload missing holes');
  }
  const parsedHoles: HoleLike[] = [];
  for (const holeRaw of holesRaw) {
    const hole = parseHole(holeRaw);
    if (hole) {
      parsedHoles.push(hole);
    }
  }
  if (!parsedHoles.length) {
    throw new Error('Round payload did not include valid holes');
  }
  parsedHoles.sort((a, b) => a.holeNo - b.holeNo);
  let totalPar = 0;
  let totalScore = 0;
  let firHit = 0;
  let firEligible = 0;
  let girHit = 0;
  let girEligible = 0;
  const holes: ParsedRoundHole[] = parsedHoles.map((hole) => {
    totalPar += hole.par;
    const strokes = hole.shots.length;
    const score = hole.score ?? strokes;
    totalScore += score;
    let fir: boolean | null = null;
    if (hole.par > 3 && hole.shots.length) {
      firEligible += 1;
      fir = fairwayHeuristic(hole.shots[0]);
      if (fir) {
        firHit += 1;
      }
    }
    const regulation = Math.max(1, hole.par - 2);
    const reached = strokesUntilGreen(hole.shots);
    let gir: boolean | null = null;
    if (reached !== null) {
      girEligible += 1;
      gir = reached <= regulation;
      if (gir) {
        girHit += 1;
      }
    }
    return {
      holeNo: hole.holeNo,
      par: hole.par,
      score,
      strokes,
      fir,
      gir,
    };
  });
  const relative = totalScore - totalPar;
  return {
    id,
    courseId,
    tee: typeof record.tee === 'string' ? record.tee : undefined,
    startedAt,
    finished: record.finished === true,
    totalPar,
    totalScore,
    relative,
    firHit,
    firEligible,
    girHit,
    girEligible,
    holes,
  };
}
