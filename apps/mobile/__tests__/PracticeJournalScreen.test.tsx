import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { Share } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PracticeJournalScreen from '@app/screens/PracticeJournalScreen';
import { logPracticeJournalOpened, logPracticeSessionShared } from '@app/analytics/practiceJournal';
import { loadPracticeSessions, type PracticeSession } from '@app/practice/practiceSessionStorage';
import { isPracticeGrowthV1Enabled } from '@shared/featureFlags/practiceGrowthV1';
import { logPracticeFeatureGated } from '@app/analytics/practiceFeatureGate';

type Navigation = { navigate: ReturnType<typeof vi.fn> };

vi.mock('@app/practice/practiceSessionStorage', () => ({
  loadPracticeSessions: vi.fn(),
}));

vi.mock('@app/analytics/practiceJournal', () => ({
  logPracticeJournalOpened: vi.fn(),
  logPracticeSessionShared: vi.fn(),
}));

vi.mock('@shared/featureFlags/practiceGrowthV1', () => ({
  isPracticeGrowthV1Enabled: vi.fn(() => true),
}));

vi.mock('@app/analytics/practiceFeatureGate', () => ({
  logPracticeFeatureGated: vi.fn(),
}));

const mockLoadPracticeSessions = vi.mocked(loadPracticeSessions);

const navigation: Navigation = { navigate: vi.fn() };
const route = { key: 'PracticeJournal', name: 'PracticeJournal', params: { source: 'home' } } as any;

const session: PracticeSession = {
  id: 'session-1',
  weekStartISO: '2024-03-11T00:00:00.000Z',
  startedAt: '2024-03-11T10:00:00.000Z',
  endedAt: '2024-03-11T10:30:00.000Z',
  drillIds: ['a', 'b'],
  completedDrillIds: ['a'],
  skippedDrillIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  vi.mocked(isPracticeGrowthV1Enabled).mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PracticeJournalScreen', () => {
  it('redirects when practice growth is disabled', async () => {
    vi.mocked(isPracticeGrowthV1Enabled).mockReturnValue(false);

    render(
      <PracticeJournalScreen
        navigation={navigation as any}
        route={{ key: 'PracticeJournal', name: 'PracticeJournal', params: { source: 'home' } } as any}
      />,
    );

    await waitFor(() => {
      expect(logPracticeFeatureGated).toHaveBeenCalledWith({
        feature: 'practiceGrowthV1',
        target: 'PracticeJournal',
        source: 'home',
      });
    });
    expect(navigation.navigate).toHaveBeenCalledWith('HomeDashboard');
  });

  it('renders empty state when there are no sessions', async () => {
    mockLoadPracticeSessions.mockResolvedValue([]);

    render(<PracticeJournalScreen navigation={navigation as any} route={route} />);

    expect(await screen.findByTestId('practice-journal-empty')).toBeInTheDocument();
    await waitFor(() => {
      expect(logPracticeJournalOpened).toHaveBeenCalled();
    });
  });

  it('lists sessions and shares recap text', async () => {
    mockLoadPracticeSessions.mockResolvedValue([session]);

    render(<PracticeJournalScreen navigation={navigation as any} route={route} />);

    expect(await screen.findByTestId('practice-journal-list')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('practice-journal-share-session-1'));

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalled();
      expect(logPracticeSessionShared).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1', drills: 2 }),
      );
    });

    const message = vi.mocked(Share.share).mock.calls[0]?.[0]?.message;
    expect(message).toContain('Practice done');
    expect(message).toContain('2 drills');
    expect(message).toContain('Tracked with GolfIQ');
  });

  it('opens weekly summary from the journal header', async () => {
    mockLoadPracticeSessions.mockResolvedValue([]);

    render(<PracticeJournalScreen navigation={navigation as any} route={route} />);

    fireEvent.click(await screen.findByTestId('practice-weekly-summary-from-journal'));

    expect(navigation.navigate).toHaveBeenCalledWith('PracticeWeeklySummary', { source: 'journal' });
  });
});
