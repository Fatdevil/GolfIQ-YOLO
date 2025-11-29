import { apiFetch } from '@app/api/client';
import type { CurrentRun } from '@app/run/currentRun';

export type RunCreationResponse = { runId: string };

export async function createRunForCurrentRound(run: CurrentRun): Promise<RunCreationResponse> {
  return apiFetch<RunCreationResponse>('/api/mobile/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: run.courseId,
      courseName: run.courseName,
      teeId: run.teeId,
      teeName: run.teeName,
      holes: run.holes,
      startedAt: run.startedAt,
      mode: run.mode,
    }),
  });
}

export async function submitScorecard(runId: string, run: CurrentRun): Promise<void> {
  const scores = Object.entries(run.scorecard ?? {}).map(([holeNumber, score]) => ({
    hole: Number(holeNumber),
    strokes: score.strokes,
    putts: score.putts,
    gir: score.gir ?? false,
    fir: score.fir ?? false,
  }));

  await apiFetch(`/api/runs/${encodeURIComponent(runId)}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dedupeKey: `scorecard-${runId}`,
      ts: Date.now() / 1000,
      kind: 'scorecard',
      payload: {
        courseId: run.courseId,
        teeId: run.teeId,
        mode: run.mode,
        scores,
      },
    }),
  });
}
