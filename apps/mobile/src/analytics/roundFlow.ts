import { safeEmit } from '@app/telemetry';

export type RoundFlowGateSource = 'home' | 'play' | 'recap' | 'unknown';

function tryEmit(event: string, payload?: Record<string, unknown>): void {
  try {
    safeEmit(event, payload ?? {});
  } catch (error) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[mobile/analytics] failed to emit ${event}`, error);
    }
  }
}

export function logRoundFlowGated(payload: { feature: 'roundFlowV2'; target: string; source: RoundFlowGateSource }): void {
  tryEmit('round_feature_gated', payload);
}

export function logRoundStartOpened(): void {
  tryEmit('round_start_opened');
}

export function logRoundResumeClicked(roundId: string): void {
  tryEmit('round_resume_clicked', { roundId });
}

export function logRoundCreateClicked(payload: { courseId?: string | null; holes?: number; teeName?: string | null }): void {
  tryEmit('round_create_clicked', payload);
}

export function logRoundCreatedSuccess(payload: { roundId: string; courseId?: string | null; holes?: number }): void {
  tryEmit('round_created_success', payload);
}

export function logRoundCreatedFailed(payload: { courseId?: string | null; holes?: number; error?: string }): void {
  tryEmit('round_created_failed', payload);
}
