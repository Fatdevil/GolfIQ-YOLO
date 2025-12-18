import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import RoundStartScreen from '@app/screens/RoundStartScreen';
import { getCurrentRound, listRounds, startRound } from '@app/api/roundClient';
import { loadActiveRoundState, saveActiveRoundState } from '@app/round/roundState';
import { fetchCourses } from '@app/api/courseClient';
import { useGeolocation } from '@app/hooks/useGeolocation';
import { removeItem, setItem } from '@app/storage/asyncStorage';

type Nav = { navigate: (...args: any[]) => void };

vi.mock('@app/api/roundClient');
vi.mock('@app/api/courseClient');
vi.mock('@app/round/roundState');
vi.mock('@app/hooks/useGeolocation');

const mockedStartRound = startRound as unknown as Mock;
const mockedSaveState = saveActiveRoundState as unknown as Mock;
const mockedLoadState = loadActiveRoundState as unknown as Mock;
const mockedGetCurrentRound = getCurrentRound as unknown as Mock;
const mockedListRounds = listRounds as unknown as Mock;
const mockedFetchCourses = fetchCourses as unknown as Mock;
const mockedUseGeolocation = useGeolocation as unknown as Mock;

beforeEach(async () => {
  vi.clearAllMocks();
  await removeItem('golfiq.courseCache.v1');
  mockedStartRound.mockResolvedValue({ id: 'r1', holes: 18, startedAt: 'now', startHole: 1 });
  mockedSaveState.mockResolvedValue(undefined);
  mockedLoadState.mockResolvedValue(null);
  mockedGetCurrentRound.mockResolvedValue({
    id: 'r1',
    holes: 18,
    startHole: 1,
    status: 'in_progress',
    startedAt: 'today',
  });
  mockedListRounds.mockResolvedValue([]);
  mockedFetchCourses.mockResolvedValue([
    { id: 'demo-links-hero', name: 'Demo Links Hero', holeCount: 5, location: null },
  ]);
  mockedUseGeolocation.mockReturnValue({ position: null, error: null, supported: false, loading: false });
});

describe('RoundStartScreen', () => {
  it('shows resume CTA when an active round exists', async () => {
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('resume-round')).toBeTruthy());
    fireEvent.click(getByTestId('resume-round'));

    await waitFor(() => expect(mockedSaveState).toHaveBeenCalled());
    expect(navigation.navigate).toHaveBeenCalledWith('RoundShot', { roundId: 'r1' });
  });

  it('starts a new round from the form', async () => {
    mockedGetCurrentRound.mockResolvedValueOnce(null);
    mockedStartRound.mockResolvedValueOnce({ id: 'new-round', holes: 9, startedAt: 'now', startHole: 1 });
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('course-input')).toBeTruthy());
    fireEvent.change(getByTestId('course-input'), { target: { value: 'Pine Valley' } });
    fireEvent.click(getByTestId('start-round-button'));

    await waitFor(() => expect(mockedStartRound).toHaveBeenCalledWith(expect.objectContaining({
      courseId: 'Pine Valley',
      holes: 18,
    })));
    expect(mockedSaveState).toHaveBeenCalledWith({
      round: expect.objectContaining({ id: 'new-round' }),
      currentHole: 1,
      preferences: { tournamentSafe: false },
    });
    expect(navigation.navigate).toHaveBeenCalledWith('RoundShot', { roundId: 'new-round' });
  });

  it('uses the first fetched course when none selected', async () => {
    mockedGetCurrentRound.mockResolvedValueOnce(null);
    mockedStartRound.mockResolvedValueOnce({ id: 'first-course', holes: 18, startedAt: 'now', startHole: 1 });
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('course-demo-links-hero')).toBeTruthy());

    fireEvent.click(getByTestId('start-round-button'));

    await waitFor(() => expect(mockedStartRound).toHaveBeenCalledWith(expect.objectContaining({
      courseId: 'demo-links-hero',
    })));
  });

  it('auto-selects nearest course and shows hint when GPS is available', async () => {
    mockedGetCurrentRound.mockResolvedValueOnce(null);
    mockedFetchCourses.mockResolvedValue([
      { id: 'near', name: 'Near', holeCount: 9, location: { lat: 59.3, lon: 18.1 } },
      { id: 'far', name: 'Far', holeCount: 9, location: { lat: 0, lon: 0 } },
    ]);
    mockedUseGeolocation.mockReturnValue({
      position: { lat: 59.3001, lon: 18.0999 },
      error: null,
      supported: true,
      loading: false,
    });
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId, getByText, getAllByTestId } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByText(/GPS suggests/i)).toBeTruthy());
    expect(getByText(/GPS suggests/i)).toBeTruthy();
    expect(getAllByTestId('course-near').length).toBeGreaterThan(0);
    fireEvent.click(getByTestId('start-round-button'));

    await waitFor(() =>
      expect(mockedStartRound).toHaveBeenCalledWith(expect.objectContaining({ courseId: 'near' })),
    );
  });

  it('prefers GPS suggestion over cached defaults when available', async () => {
    await setItem(
      'golfiq.courseCache.v1',
      JSON.stringify([{ id: 'demo-links-hero', name: 'Demo Links Hero', holeCount: 5, location: null }]),
    );
    mockedGetCurrentRound.mockResolvedValueOnce(null);
    mockedFetchCourses.mockResolvedValue([
      { id: 'near', name: 'Near', holeCount: 9, location: { lat: 59.3, lon: 18.1 } },
      { id: 'far', name: 'Far', holeCount: 9, location: { lat: 0, lon: 0 } },
    ]);
    mockedUseGeolocation.mockReturnValue({
      position: { lat: 59.3001, lon: 18.0999 },
      error: null,
      supported: true,
      loading: false,
    });
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId, getByText } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByText(/GPS suggests/i)).toBeTruthy());
    fireEvent.click(getByTestId('start-round-button'));

    await waitFor(() =>
      expect(mockedStartRound).toHaveBeenCalledWith(expect.objectContaining({ courseId: 'near' })),
    );
  });

  it('does not auto-select when geolocation is unavailable', async () => {
    mockedGetCurrentRound.mockResolvedValueOnce(null);
    mockedFetchCourses.mockResolvedValueOnce([
      { id: 'demo-links-hero', name: 'Demo Links Hero', holeCount: 5, location: null },
    ]);
    mockedUseGeolocation.mockReturnValue({ position: null, error: null, supported: false, loading: false });

    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId, queryByText } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('course-demo-links-hero')).toBeTruthy());
    expect(queryByText(/GPS suggests/)).toBeNull();
  });

  it('persists tournament safe preference when toggled', async () => {
    mockedGetCurrentRound.mockResolvedValueOnce(null);
    mockedStartRound.mockResolvedValueOnce({ id: 'safe-round', holes: 18, startedAt: 'now', startHole: 1 });
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('tournament-safe-toggle')).toBeTruthy());
    fireEvent.click(getByTestId('tournament-safe-toggle'));
    fireEvent.change(getByTestId('course-input'), { target: { value: 'Safe Course' } });
    fireEvent.click(getByTestId('start-round-button'));

    await waitFor(() =>
      expect(mockedSaveState).toHaveBeenCalledWith({
        round: expect.objectContaining({ id: 'safe-round' }),
        currentHole: 1,
        preferences: { tournamentSafe: true },
      }),
    );
  });

  it('applies tournament-safe toggle when resuming cached round without preferences', async () => {
    mockedLoadState.mockResolvedValue({
      round: { id: 'r1', holes: 18, startHole: 1, status: 'in_progress', startedAt: 'today' },
      currentHole: 3,
    });
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('resume-round')).toBeTruthy());
    fireEvent.change(getByTestId('tournament-safe-toggle'), { target: { checked: true } });
    fireEvent.click(getByTestId('resume-round'));

    await waitFor(() =>
      expect(mockedSaveState).toHaveBeenCalledWith(
        expect.objectContaining({ preferences: expect.objectContaining({ tournamentSafe: true }) }),
      ),
    );
  });

  it('overrides cached preferences with current toggle when resuming same round', async () => {
    mockedLoadState.mockResolvedValue({
      round: { id: 'r1', holes: 18, startHole: 1, status: 'in_progress', startedAt: 'today' },
      currentHole: 4,
      preferences: { tournamentSafe: false },
    });
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('resume-round')).toBeTruthy());
    fireEvent.click(getByTestId('tournament-safe-toggle'));
    fireEvent.click(getByTestId('resume-round'));

    await waitFor(() =>
      expect(mockedSaveState).toHaveBeenCalledWith(
        expect.objectContaining({ preferences: expect.objectContaining({ tournamentSafe: true }) }),
      ),
    );
  });

  it('respects cached tournament-safe preference when resuming without toggling', async () => {
    mockedLoadState.mockResolvedValue({
      round: { id: 'r1', holes: 18, startHole: 1, status: 'in_progress', startedAt: 'today' },
      currentHole: 4,
      preferences: { tournamentSafe: true },
    });
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('resume-round')).toBeTruthy());
    fireEvent.click(getByTestId('resume-round'));

    await waitFor(() =>
      expect(mockedSaveState).toHaveBeenCalledWith(
        expect.objectContaining({ preferences: expect.objectContaining({ tournamentSafe: true }) }),
      ),
    );
  });

  it('renders start new flow even when active round check fails', async () => {
    mockedGetCurrentRound.mockRejectedValueOnce(new Error('offline'));
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('start-new-round')).toBeTruthy());
  });
});
