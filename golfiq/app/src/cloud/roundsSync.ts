import type { RoundSummary } from '../../../../shared/round/summary';
import type { RoundState } from '../../../../shared/round/types';
import { cloudEnabled, ensureSupabaseSession, supa } from './supabase';
import { listRounds as mockListRounds, pushRound as mockPushRound } from './mockSupabase';
import { CloudSyncError, upsertOrThrow } from './supabaseSafe';

export type CloudRoundRow = {
  id: string;
  courseId: string;
  startedAt: number;
  finishedAt?: number;
  holes: { start: number; end: number };
  summary: {
    strokes: number;
    putts: number;
    sg: { ott: number; app: number; arg: number; putt: number; total: number };
    firPct: number | null;
    girPct: number | null;
    penalties?: number;
    toPar?: number | null;
  };
  updatedAt: number;
};

export type PushRoundResult = {
  ok: boolean;
  reason?: string;
  status?: number;
  code?: string;
};

const realRoundsApi = (() => {
  if (!cloudEnabled || !supa) {
    return null;
  }

  async function pushRound(round: RoundState, summary: RoundSummary): Promise<PushRoundResult> {
    const session = await ensureSupabaseSession();
    if (!session) {
      return { ok: false, reason: 'Sign in to back up rounds' };
    }
    const holeNumbers = summary.holes.map((hole) => hole.hole);
    const start = holeNumbers.length ? Math.min(...holeNumbers) : 1;
    const end = holeNumbers.length ? Math.max(...holeNumbers) : start;

    const summaryPayload = {
      strokes: summary.strokes,
      putts: summary.putts,
      sg: {
        ott: summary.phases.ott,
        app: summary.phases.app,
        arg: summary.phases.arg,
        putt: summary.phases.putt,
        total: summary.phases.total,
      },
      firPct: summary.firPct ?? null,
      girPct: summary.girPct ?? null,
      penalties: summary.penalties,
      toPar: summary.toPar,
    };

    const body = {
      id: round.id,
      owner: session.userId,
      course_id: round.courseId,
      started_at: new Date(round.startedAt).toISOString(),
      finished_at: round.finishedAt ? new Date(round.finishedAt).toISOString() : null,
      holes: { start, end },
      summary: summaryPayload,
    };

    try {
      await upsertOrThrow('rounds', body, { onConflict: 'id', returning: 'minimal' });
      return { ok: true };
    } catch (error) {
      if (error instanceof CloudSyncError) {
        return { ok: false, reason: error.message, status: error.status, code: error.code };
      }
      if (error instanceof Error) {
        return { ok: false, reason: error.message };
      }
      return { ok: false, reason: 'Unable to back up round' };
    }
  }

  async function listRounds(): Promise<CloudRoundRow[]> {
    const session = await ensureSupabaseSession();
    if (!session) {
      return [];
    }
    const { data, error } = await supa
      .from('rounds')
      .select('id, course_id, started_at, finished_at, holes, summary, updated_at')
      .order('updated_at', { ascending: false });
    if (error || !data) {
      return [];
    }
    return (data as Array<{
      id: string;
      course_id: string;
      started_at: string;
      finished_at: string | null;
      holes: { start: number; end: number } | null;
      summary: CloudRoundRow['summary'];
      updated_at: string;
    }>).map((row) => ({
      id: row.id,
      courseId: row.course_id,
      startedAt: Number.isFinite(Date.parse(row.started_at)) ? Date.parse(row.started_at) : Date.now(),
      finishedAt:
        row.finished_at && Number.isFinite(Date.parse(row.finished_at)) ? Date.parse(row.finished_at) : undefined,
      holes: row.holes ?? { start: 1, end: 18 },
      summary: row.summary,
      updatedAt: Number.isFinite(Date.parse(row.updated_at)) ? Date.parse(row.updated_at) : Date.now(),
    }));
  }

  return {
    pushRound,
    listRounds,
  } as const;
})();

const activeRoundsApi = realRoundsApi ?? {
  pushRound: async (round: RoundState, summary: RoundSummary): Promise<PushRoundResult> => {
    try {
      await mockPushRound(round, summary);
      return { ok: true };
    } catch (error) {
      if (error instanceof Error) {
        return {
          ok: false,
          reason: error.message,
          status: (error as Error & { status?: number }).status,
          code: (error as Error & { code?: string }).code,
        };
      }
      return { ok: false, reason: 'Unable to back up round' };
    }
  },
  listRounds: async (): Promise<CloudRoundRow[]> => {
    const rows = await mockListRounds();
    return rows.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      holes: row.holes,
      summary: {
        strokes: row.summary.strokes,
        putts: row.summary.putts,
        sg: {
          ott: row.summary.phases.ott,
          app: row.summary.phases.app,
          arg: row.summary.phases.arg,
          putt: row.summary.phases.putt,
          total: row.summary.phases.total,
        },
        firPct: row.summary.firPct ?? null,
        girPct: row.summary.girPct ?? null,
        penalties: row.summary.penalties,
        toPar: row.summary.toPar,
      },
      updatedAt: row.updatedAt,
    }));
  },
};

export const roundsCloudAvailable = Boolean(realRoundsApi);

export async function pushRound(round: RoundState, summary: RoundSummary): Promise<PushRoundResult> {
  return activeRoundsApi.pushRound(round, summary);
}

export async function listRounds(): Promise<CloudRoundRow[]> {
  return activeRoundsApi.listRounds();
}

