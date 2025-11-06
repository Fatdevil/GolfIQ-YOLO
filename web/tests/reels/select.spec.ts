import { describe, expect, it } from 'vitest';

import { makeTimeline, pickTopShots, planFrame, scoreShot } from '@shared/reels/select';
import type { ReelShotRef } from '@shared/reels/types';

describe('reels selection', () => {
  it('scores higher carry and apex shots above others', () => {
    const base: ReelShotRef = { id: 'a', ts: 1000 };
    const low = { ...base, carry_m: 150, apex_m: 20 };
    const high = { ...base, id: 'b', carry_m: 180, apex_m: 32 };
    expect(scoreShot(high)).toBeGreaterThan(scoreShot(low));
  });

  it('does not inflate score when carry is missing', () => {
    const valid: ReelShotRef = {
      id: 'valid',
      ts: 1,
      club: '7i',
      carry_m: 150,
      apex_m: 30,
      ballSpeed_mps: 60,
    };
    const speedOnly: ReelShotRef = {
      id: 'speed-only',
      ts: 2,
      club: '7i',
      ballSpeed_mps: 60,
    };
    expect(scoreShot(valid)).toBeGreaterThan(scoreShot(speedOnly));
  });

  it('flush term is zero when carry <= 0', () => {
    const z1: ReelShotRef = { id: 'z1', ts: 1, ballSpeed_mps: 60, carry_m: 0 };
    const z2: ReelShotRef = { id: 'z2', ts: 2, ballSpeed_mps: 60 };
    expect(scoreShot(z1)).toBe(0);
    expect(scoreShot(z2)).toBe(0);
  });

  it('enforces club or time diversity when picking top shots', () => {
    const now = Date.now();
    const pool: ReelShotRef[] = [
      { id: '1', ts: now, club: '7I', carry_m: 160 },
      { id: '2', ts: now + 1000, club: '7I', carry_m: 162 },
      { id: '3', ts: now + 8_000, club: '7I', carry_m: 155 },
      { id: '4', ts: now + 2_000, club: 'PW', carry_m: 120 },
    ];
    const picked = pickTopShots(pool, 2);
    expect(picked).toHaveLength(2);
    const [first, second] = picked;
    expect(first.id).not.toBe(second.id);
    const sameClub = first.club && second.club && first.club === second.club;
    const farApart = Math.abs(first.ts - second.ts) > 5_000;
    expect(sameClub ? farApart : true).toBe(true);
  });

  it('builds a consistent timeline and frame plan', () => {
    const shots: ReelShotRef[] = [
      { id: 'shot-1', ts: 0, club: '7I', carry_m: 162 },
      { id: 'shot-2', ts: 5_000, club: '9I', carry_m: 140 },
    ];
    const timeline = makeTimeline(shots, 30);
    expect(timeline.width).toBe(1080);
    expect(timeline.height).toBe(1920);
    expect(timeline.frames).toBe(2 * 60);
    expect(timeline.shots[0]?.startFrame).toBe(0);
    expect(timeline.shots[1]?.startFrame).toBe(60);
    const commands = planFrame(timeline, 0);
    expect(commands.some((cmd) => cmd.t === 'bg')).toBe(true);
  });

  it('pickTopShots ignores speed-only samples when filter is on', () => {
    const good: ReelShotRef = {
      id: 'g',
      ts: 1,
      carry_m: 140,
      apex_m: 25,
      ballSpeed_mps: 58,
      tracer: { points: [
        [0, 0],
        [0.5, 0.3],
        [1, 0.2],
        [0.9, 0.1],
      ] },
    };
    const speedOnly: ReelShotRef = { id: 's', ts: 2, ballSpeed_mps: 62 };
    const out = pickTopShots([speedOnly, good], 1);
    expect(out[0]?.id).toBe('g');
  });
});
