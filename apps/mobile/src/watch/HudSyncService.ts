import { ApiError, apiFetch } from '@app/api/client';

export interface HudSyncContext {
  memberId: string;
  runId?: string;
  courseId: string;
  courseName: string;
  teeName: string;
  holes: number;
  currentHole: number;
  par?: number | null;
  strokeIndex?: number | null;
  lengthMeters?: number | null;
}

function buildHudDraft(ctx: HudSyncContext) {
  const length = ctx.lengthMeters ?? undefined;
  return {
    hole: ctx.currentHole,
    courseId: ctx.courseId,
    par: ctx.par ?? undefined,
    strokeIndex: ctx.strokeIndex ?? undefined,
    toGreen_m: length,
    toFront_m: length,
    toBack_m: length,
    teeName: ctx.teeName,
  };
}

export async function syncHoleHud(ctx: HudSyncContext): Promise<void> {
  if (!ctx.runId) return;

  const payload = {
    memberId: ctx.memberId,
    runId: ctx.runId,
    courseId: ctx.courseId,
    hole: ctx.currentHole,
    hud: buildHudDraft(ctx),
  };

  try {
    await apiFetch('/api/watch/quickround/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status && err.status >= 400 && err.status < 500) {
      console.warn('Watch HUD sync skipped', err.message);
      return;
    }
    console.warn('Watch HUD sync failed', err);
  }
}
