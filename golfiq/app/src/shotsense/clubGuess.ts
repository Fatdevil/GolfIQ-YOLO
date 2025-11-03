import { AutoDetectedShot } from '../../../../shared/shotsense/types';

const PAR_TO_CLUB: Record<number, string> = { 3: '7I', 4: 'DR', 5: 'DR' };

export function guessClub(shot: AutoDetectedShot): { code?: string; label?: string } {
  const follow = typeof globalThis !== 'undefined' ? (globalThis as any).__follow : null;
  const par: number | undefined = Number.isFinite(follow?.par ?? NaN) ? Number(follow.par) : undefined;
  if (shot.lie === 'Tee' && par && PAR_TO_CLUB[par]) {
    const code = PAR_TO_CLUB[par];
    return { code, label: `suggest ${code}` };
  }
  return {};
}
