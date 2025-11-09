import { useRef } from 'react';

import { postScore, type PostScoreArgs, type PostScoreResult } from '@app/api/events';
import { safeEmit } from '@app/telemetry';
import { scoreFingerprint } from '@app/utils/scoreFingerprint';

export type QueueItem = {
  eventId: string;
  scorecardId: string;
  hole: number;
  strokes: number;
  putts?: number | null;
  revision: number;
  fingerprint: string;
  attempts: number;
  nextAt: number;
  stuck?: boolean;
};

export type EnqueueArgs = {
  eventId: string;
  scorecardId: string;
  hole: number;
  strokes: number;
  putts?: number | null;
  revision?: number | null;
  baseRevision?: number | null;
};

type PostScoreFn = (args: PostScoreArgs) => Promise<PostScoreResult>;

type TelemetryFn = typeof safeEmit;

type ScoreQueueDeps = {
  postScore?: PostScoreFn;
  now?: () => number;
  random?: () => number;
  emit?: TelemetryFn;
};

function determineRevision(args: EnqueueArgs): number {
  if (typeof args.revision === 'number' && Number.isFinite(args.revision)) {
    return Math.max(1, Math.floor(args.revision));
  }
  if (typeof args.baseRevision === 'number' && Number.isFinite(args.baseRevision)) {
    return Math.max(1, Math.floor(args.baseRevision) + 1);
  }
  return 1;
}

function buildFingerprint(input: QueueItem): string {
  return scoreFingerprint({
    scorecardId: input.scorecardId,
    hole: input.hole,
    strokes: input.strokes,
    putts: input.putts ?? null,
    revision: input.revision,
  });
}

export class ScoreQueueController {
  private readonly postScore: PostScoreFn;

  private readonly now: () => number;

  private readonly random: () => number;

  private readonly emit: TelemetryFn;

  private items: QueueItem[] = [];

  constructor(deps: ScoreQueueDeps = {}) {
    this.postScore = deps.postScore ?? postScore;
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
    this.emit = deps.emit ?? safeEmit;
  }

  enqueue(args: EnqueueArgs): QueueItem {
    const revision = determineRevision(args);
    const item: QueueItem = {
      eventId: args.eventId,
      scorecardId: args.scorecardId,
      hole: args.hole,
      strokes: args.strokes,
      putts: args.putts ?? null,
      revision,
      fingerprint: '',
      attempts: 0,
      nextAt: this.now(),
    };
    item.fingerprint = buildFingerprint(item);
    this.items.push(item);
    return item;
  }

  getItems(): QueueItem[] {
    return this.items.slice();
  }

  size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }

  async flush(now: number = this.now()): Promise<number> {
    const due = this.items.filter((item) => !item.stuck && item.nextAt <= now);
    if (!due.length) {
      return 0;
    }
    let flushed = 0;

    for (const item of due) {
      const result = await this.safePost(this.toPostArgs(item));
      if (result.ok) {
        this.finishSuccess(item, result.idempotent === true);
        flushed += 1;
        continue;
      }

      if (result.retry === 'bump' && typeof result.currentRevision === 'number') {
        const newRevision = result.currentRevision + 1;
        const bumpedArgs = {
          ...item,
          revision: newRevision,
          fingerprint: scoreFingerprint({
            scorecardId: item.scorecardId,
            hole: item.hole,
            strokes: item.strokes,
            putts: item.putts ?? null,
            revision: newRevision,
          }),
        } satisfies QueueItem;
        this.emit('mobile.score.retry_bumped', { prevRev: item.revision, newRev: newRevision });
        const retryResult = await this.safePost(this.toPostArgs(bumpedArgs));
        if (retryResult.ok) {
          this.finishSuccess(item, retryResult.idempotent === true);
          flushed += 1;
          continue;
        }
        item.attempts += 1;
        item.stuck = true;
        item.nextAt = now;
        this.emit('mobile.score.conflict_unresolved', { hole: item.hole, revTried: newRevision });
        continue;
      }

      this.scheduleRetry(item, now);
    }

    return flushed;
  }

  private toPostArgs(item: QueueItem): PostScoreArgs {
    return {
      eventId: item.eventId,
      scorecardId: item.scorecardId,
      hole: item.hole,
      strokes: item.strokes,
      putts: item.putts ?? null,
      revision: item.revision,
      fingerprint: item.fingerprint,
    };
  }

  private async safePost(args: PostScoreArgs): Promise<PostScoreResult> {
    try {
      return await this.postScore(args);
    } catch (error) {
      return { ok: false, status: 0 };
    }
  }

  private finishSuccess(item: QueueItem, idempotent: boolean): void {
    this.emit('mobile.score.flushed', { count: 1, idempotent });
    this.items = this.items.filter((entry) => entry !== item);
  }

  private scheduleRetry(item: QueueItem, now: number): void {
    const attemptIndex = item.attempts;
    item.attempts = attemptIndex + 1;
    if (item.attempts >= 5) {
      item.stuck = true;
      item.nextAt = now;
      return;
    }
    const base = Math.min(800, 100 * 2 ** attemptIndex);
    const jitter = Math.floor(this.random() * 50);
    item.nextAt = now + base + jitter;
  }
}

export function createScoreQueue(deps: ScoreQueueDeps = {}): ScoreQueueController {
  return new ScoreQueueController(deps);
}

export function useScoreQueue(deps: ScoreQueueDeps = {}): ScoreQueueController {
  const ref = useRef<ScoreQueueController | null>(null);
  if (!ref.current) {
    ref.current = createScoreQueue(deps);
  }
  return ref.current;
}
