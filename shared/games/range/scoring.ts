import type { GameState, RingTarget, ShotIn, Hit } from './types';
import { isHit } from './targets';

export function createGame(targets: RingTarget[], ts = Date.now()): GameState {
  return {
    mode: 'target_bingo',
    startedAt: ts,
    targets,
    shots: [],
    hits: [],
    score: 0,
    streak: 0,
    perClub: {},
  };
}

function basePoints(t: RingTarget, err_m: number): number {
  const tight = Math.max(1, t.radius_m);
  const pct = Math.max(0, 1 - err_m / tight);
  return Math.round(50 + pct * 50);
}

export function recordShot(gs: GameState, s: ShotIn): GameState {
  const next: GameState = { ...gs, shots: gs.shots.concat(s) };
  const p = s.landing;
  if (!p) {
    return next;
  }

  const hit = gs.targets.find(t => isHit(t, p));
  if (!hit) {
    next.streak = 0;
    const club = s.club ?? 'Any';
    const pc = next.perClub[club] ?? { shots: 0, hits: 0, score: 0 };
    next.perClub[club] = { ...pc, shots: pc.shots + 1 };
    return next;
  }

  const dx = p.x - hit.center.x;
  const dy = p.y - hit.center.y;
  const err = Math.sqrt(dx * dx + dy * dy);

  const streakNext = Math.min(4, next.streak + 1);
  const mult = [0, 1, 1.2, 1.5, 2.0][streakNext];
  const points = Math.round(basePoints(hit, err) * mult);

  const h: Hit = {
    targetId: hit.id,
    shotTs: s.ts,
    club: s.club,
    distanceError_m: Math.abs(dx),
    lateral_m: dy,
    points,
  };
  next.hits = next.hits.concat(h);
  next.score = next.score + points;
  next.streak = streakNext;

  const club = s.club ?? 'Any';
  const pc = next.perClub[club] ?? { shots: 0, hits: 0, score: 0 };
  next.perClub[club] = {
    shots: pc.shots + 1,
    hits: pc.hits + 1,
    score: pc.score + points,
  };
  return next;
}

export function endGame(gs: GameState, ts = Date.now()): GameState {
  return { ...gs, endedAt: ts };
}
