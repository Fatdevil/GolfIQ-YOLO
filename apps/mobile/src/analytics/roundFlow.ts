import { safeEmit } from '@app/telemetry';

export type RoundFlowGateSource = 'home' | 'play' | 'recap' | 'unknown';
export type RoundFlowV2Screen = 'Home' | 'HomeDashboard' | 'StartRoundV2' | 'StartRound';
export type RoundFlowV2HomeCtaType = 'start' | 'continue';
export type RoundFlowV2HydrateSource = 'cached' | 'remote' | 'mixed' | 'none';
export type RoundFlowV2ErrorType = 'network' | 'timeout' | 'http' | 'unknown';

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

export function logRoundHomeStartClicked(): void {
  tryEmit('round_home_start_clicked');
}

export function logRoundResumeClicked(roundId: string): void {
  tryEmit('round_resume_clicked', { roundId });
}

export function logRoundHomeContinueClicked(roundId: string): void {
  tryEmit('round_home_continue_clicked', { roundId });
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

type RoundFlowV2BasePayload = {
  roundFlowV2Enabled: boolean;
  roundFlowV2Reason: string;
  screen: RoundFlowV2Screen;
};

export function logRoundFlowV2FlagEvaluated(payload: {
  roundFlowV2Enabled: boolean;
  roundFlowV2Reason: string;
}): void {
  tryEmit('roundflowv2_flag_evaluated', payload);
}

export function logRoundFlowV2HomeCardImpression(
  payload: RoundFlowV2BasePayload & {
    ctaType: RoundFlowV2HomeCtaType;
    activeRoundLoading: boolean;
    hasActiveRoundCached?: boolean;
    hasActiveRoundRemote?: boolean;
  },
): void {
  tryEmit('roundflowv2_home_card_impression', payload);
}

export function logRoundFlowV2HomeCtaTap(
  payload: RoundFlowV2BasePayload & {
    ctaType: RoundFlowV2HomeCtaType;
    activeRoundLoading: boolean;
    hasActiveRoundCached?: boolean;
    hasActiveRoundRemote?: boolean;
  },
): void {
  tryEmit('roundflowv2_home_cta_tap', payload);
}

export function logRoundFlowV2HomeCtaBlockedLoading(
  payload: RoundFlowV2BasePayload & {
    ctaType: RoundFlowV2HomeCtaType;
    activeRoundLoading: boolean;
    hasActiveRoundCached?: boolean;
    hasActiveRoundRemote?: boolean;
  },
): void {
  tryEmit('roundflowv2_home_cta_blocked_loading', payload);
}

export function logRoundFlowV2ActiveRoundHydrateStart(
  payload: RoundFlowV2BasePayload & {
    source: RoundFlowV2HydrateSource;
  },
): void {
  tryEmit('roundflowv2_active_round_hydrate_start', payload);
}

export function logRoundFlowV2ActiveRoundHydrateSuccess(
  payload: RoundFlowV2BasePayload & {
    source: RoundFlowV2HydrateSource;
    durationMs: number;
  },
): void {
  tryEmit('roundflowv2_active_round_hydrate_success', payload);
}

export function logRoundFlowV2ActiveRoundHydrateFailure(
  payload: RoundFlowV2BasePayload & {
    source: RoundFlowV2HydrateSource;
    durationMs: number;
    errorType: RoundFlowV2ErrorType;
  },
): void {
  tryEmit('roundflowv2_active_round_hydrate_failure', payload);
}

export function logRoundFlowV2StartRoundRequest(payload: RoundFlowV2BasePayload): void {
  tryEmit('roundflowv2_start_round_request', payload);
}

export function logRoundFlowV2StartRoundResponse(
  payload: RoundFlowV2BasePayload & {
    reusedActiveRound?: boolean | null;
    httpStatus?: number | null;
    durationMs?: number | null;
  },
): void {
  tryEmit('roundflowv2_start_round_response', payload);
}
