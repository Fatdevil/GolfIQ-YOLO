import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import HomeScreen from '@app/screens/HomeScreen';
import * as playerApi from '@app/api/player';
import * as currentRun from '@app/run/currentRun';
import * as lastRound from '@app/run/lastRound';
import * as rangeSummary from '@app/range/rangeSummaryStorage';
import * as practicePlanStorage from '@app/practice/practicePlanStorage';
import * as roundClient from '@app/api/roundClient';
import * as roundState from '@app/round/roundState';
import { setTelemetryEmitter } from '@app/telemetry';
import { resetRemoteFeatureFlags, setRemoteFeatureFlag } from '@shared/featureFlags/remote';

vi.mock('@app/api/player', () => ({
  fetchAccessPlan: vi.fn(),
  fetchPlayerAnalytics: vi.fn(),
  fetchPlayerProfile: vi.fn(),
}));
vi.mock('@app/run/currentRun', () => ({ clearCurrentRun: vi.fn(), loadCurrentRun: vi.fn() }));
vi.mock('@app/run/lastRound', () => ({ loadLastRoundSummary: vi.fn() }));
vi.mock('@app/range/rangeSummaryStorage', () => ({ loadLastRangeSessionSummary: vi.fn() }));
vi.mock('@app/practice/practicePlanStorage', () => ({ loadCurrentWeekPracticePlan: vi.fn(), getWeekStartISO: vi.fn() }));
vi.mock('@app/analytics/practiceHome', () => ({
  logPracticeHomeCardViewed: vi.fn(),
  logPracticeHomeCta: vi.fn(),
}));
vi.mock('@app/analytics/practiceFeatureGate', () => ({ logPracticeFeatureGated: vi.fn() }));
vi.mock('@shared/featureFlags/practiceGrowthV1', () => ({ isPracticeGrowthV1Enabled: vi.fn(() => false) }));
vi.mock('@app/api/roundClient', () => ({
  fetchActiveRoundSummary: vi.fn(),
  getCurrentRound: vi.fn(),
}));
vi.mock('@app/round/roundState', () => ({
  loadActiveRoundState: vi.fn(),
  saveActiveRoundState: vi.fn(),
}));

const mockProfile: playerApi.PlayerProfile = {
  memberId: 'member-1',
  name: 'Player One',
  model: { playerType: 'balanced', style: null, strengths: [], weaknesses: [] },
  plan: { focusCategories: [], steps: [] },
};

function renderHome(): void {
  const navigation = { navigate: vi.fn(), setParams: vi.fn(), goBack: vi.fn() } as any;
  const route = { key: 'PlayerHome', name: 'PlayerHome' } as any;
  render(<HomeScreen navigation={navigation} route={route} />);
}

describe('HomeScreen roundflowv2 telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(playerApi.fetchPlayerProfile).mockResolvedValue(mockProfile);
    vi.mocked(playerApi.fetchAccessPlan).mockResolvedValue({ plan: 'free' });
    vi.mocked(playerApi.fetchPlayerAnalytics).mockResolvedValue(null as any);
    vi.mocked(currentRun.loadCurrentRun).mockResolvedValue(null);
    vi.mocked(lastRound.loadLastRoundSummary).mockResolvedValue(null);
    vi.mocked(rangeSummary.loadLastRangeSessionSummary).mockResolvedValue(null);
    vi.mocked(practicePlanStorage.loadCurrentWeekPracticePlan).mockResolvedValue(null as any);
    vi.mocked(practicePlanStorage.getWeekStartISO).mockReturnValue('2024-01-01');
    vi.mocked(roundClient.fetchActiveRoundSummary).mockResolvedValue(null as any);
    vi.mocked(roundClient.getCurrentRound).mockResolvedValue(null as any);
    vi.mocked(roundState.loadActiveRoundState).mockResolvedValue(null as any);
    vi.mocked(roundState.saveActiveRoundState).mockResolvedValue();
  });

  afterEach(() => {
    setTelemetryEmitter(null);
    resetRemoteFeatureFlags();
  });

  it('emits flag evaluation and impression with allowlist reason', async () => {
    const telemetry = vi.fn();
    setTelemetryEmitter(telemetry);
    setRemoteFeatureFlag('roundFlowV2', {
      enabled: true,
      rolloutPct: 100,
      reason: 'allowlist',
      source: 'rollout',
    });

    renderHome();

    await waitFor(() => {
      expect(telemetry).toHaveBeenCalledWith(
        'roundflowv2_flag_evaluated',
        expect.objectContaining({ roundFlowV2Enabled: true, roundFlowV2Reason: 'allowlist' }),
      );
    });

    await waitFor(() => {
      expect(telemetry).toHaveBeenCalledWith(
        'roundflowv2_home_card_impression',
        expect.objectContaining({ roundFlowV2Reason: 'allowlist' }),
      );
    });
  });

  it('emits flag evaluation when disabled', async () => {
    const telemetry = vi.fn();
    setTelemetryEmitter(telemetry);
    setRemoteFeatureFlag('roundFlowV2', {
      enabled: false,
      rolloutPct: 100,
      reason: 'force_off',
      source: 'rollout',
    });

    renderHome();

    await waitFor(() => {
      expect(telemetry).toHaveBeenCalledWith(
        'roundflowv2_flag_evaluated',
        expect.objectContaining({ roundFlowV2Enabled: false, roundFlowV2Reason: 'force_off' }),
      );
    });
  });

  it('falls back to unknown reason when missing', async () => {
    const telemetry = vi.fn();
    setTelemetryEmitter(telemetry);
    setRemoteFeatureFlag('roundFlowV2', {
      enabled: true,
      rolloutPct: 100,
      source: 'rollout',
    });

    renderHome();

    await waitFor(() => {
      expect(telemetry).toHaveBeenCalledWith(
        'roundflowv2_flag_evaluated',
        expect.objectContaining({ roundFlowV2Reason: 'unknown' }),
      );
    });
  });
});
