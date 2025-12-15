import { describe, expect, it } from 'vitest';
import {
  buildSgLightExplainerOpenedPayload,
  buildSgLightImpressionKey,
  buildSgLightPracticeCtaClickedPayload,
  buildSgLightSummaryImpressionTelemetry,
  buildSgLightSummaryViewedPayload,
  buildSgLightTrendImpressionTelemetry,
  SG_LIGHT_EXPLAINER_OPENED_EVENT,
  SG_LIGHT_PRACTICE_FOCUS_ENTRY_CLICKED_EVENT,
  SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT,
  SG_LIGHT_SUMMARY_VIEWED_EVENT,
  SG_LIGHT_TREND_VIEWED_EVENT,
} from '@shared/sgLight/analytics';

describe('sg light analytics contract (mobile)', () => {
  it('builds recap summary keys', () => {
    expect(
      buildSgLightImpressionKey({
        surface: 'round_recap',
        contextId: 'round-abc',
        cardType: 'summary',
      }),
    ).toBe('sg_light:round_recap:round-abc:summary');

    expect(
      buildSgLightSummaryViewedPayload({ surface: 'round_recap', contextId: 'round-abc' }),
    ).toEqual({ impressionKey: 'sg_light:round_recap:round-abc:summary' });
  });

  it('pairs summary impression telemetry with the locked event name', () => {
    expect(
      buildSgLightSummaryImpressionTelemetry({ surface: 'round_recap', contextId: 'round-abc' }),
    ).toEqual({
      eventName: SG_LIGHT_SUMMARY_VIEWED_EVENT,
      payload: { impressionKey: 'sg_light:round_recap:round-abc:summary' },
    });
  });

  it('builds trend keys with focus category for round story', () => {
    expect(
      buildSgLightImpressionKey({
        surface: 'round_story',
        contextId: 'round-def',
        cardType: 'trend',
        focusCategory: 'approach',
      }),
    ).toBe('sg_light:round_story:round-def:trend:approach');
  });

  it('pairs trend impression telemetry with the locked event name', () => {
    expect(
      buildSgLightTrendImpressionTelemetry({
        surface: 'round_story',
        platform: 'mobile',
        roundId: 'round-def',
        trend: {
          windowSize: 4,
          perCategory: {
            tee: { avgDelta: 0.1, rounds: 4 },
            approach: { avgDelta: -0.2, rounds: 4 },
            short_game: { avgDelta: 0.0, rounds: 4 },
            putting: { avgDelta: 0.05, rounds: 4 },
          },
          focusHistory: [
            { focusCategory: 'approach', roundId: 'round-def', playedAt: '2024-01-01' },
          ],
        },
        focusCategory: 'approach',
      }),
    ).toEqual({
      eventName: SG_LIGHT_TREND_VIEWED_EVENT,
      payload: {
        surface: 'round_story',
        platform: 'mobile',
        roundId: 'round-def',
        windowSize: 4,
        focusCategory: 'approach',
      },
    });
  });

  it('locks explainer payloads for recap and stats surfaces', () => {
    expect(SG_LIGHT_EXPLAINER_OPENED_EVENT).toBe('sg_light_explainer_opened');
    expect(SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT).toBe('practice_focus_entry_shown');

    expect(
      buildSgLightExplainerOpenedPayload({
        surface: 'round_story',
        contextId: 'round-abc',
      }),
    ).toEqual({ surface: 'round_story', roundId: 'round-abc' });

    expect(
      buildSgLightExplainerOpenedPayload({
        surface: 'player_stats',
        contextId: null,
      }),
    ).toEqual({ surface: 'player_stats' });
  });

  it('locks practice CTA payloads across mobile sg light surfaces', () => {
    expect(SG_LIGHT_PRACTICE_FOCUS_ENTRY_CLICKED_EVENT).toBe('practice_focus_entry_clicked');

    expect(
      buildSgLightPracticeCtaClickedPayload({
        surface: 'round_recap',
        focusCategory: 'tee',
      }),
    ).toEqual({
      surface: 'round_recap',
      focusCategory: 'tee',
    });

    expect(
      buildSgLightPracticeCtaClickedPayload({
        surface: 'mobile_stats_sg_light_trend',
        focusCategory: 'approach',
      }),
    ).toEqual({ surface: 'mobile_stats_sg_light_trend', focusCategory: 'approach' });
  });
});
