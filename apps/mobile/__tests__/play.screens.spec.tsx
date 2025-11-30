import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { fetchCourseBundle, fetchHeroCourses } from '@app/api/courses';
import { fetchAccessPlan, fetchPlayerProfile } from '@app/api/player';
import { createRunForCurrentRound } from '@app/api/runs';
import CourseSelectScreen from '@app/screens/play/CourseSelectScreen';
import TeeSelectScreen from '@app/screens/play/TeeSelectScreen';
import InRoundScreen from '@app/screens/play/InRoundScreen';
import {
  saveCurrentRun,
  loadCurrentRun,
  clearCurrentRun,
  finishCurrentRound,
  countScoredHoles,
} from '@app/run/currentRun';
import { getItem, setItem } from '@app/storage/asyncStorage';
import { syncHoleHud } from '@app/watch/HudSyncService';

vi.mock('@app/api/courses', () => ({
  fetchHeroCourses: vi.fn(),
  fetchCourseBundle: vi.fn(),
}));

vi.mock('@app/api/player', () => ({
  fetchAccessPlan: vi.fn(),
  fetchPlayerProfile: vi.fn(),
}));

vi.mock('@app/api/runs', () => ({
  createRunForCurrentRound: vi.fn(),
}));

vi.mock('@app/run/currentRun', () => ({
  CURRENT_RUN_VERSION: 1,
  saveCurrentRun: vi.fn(),
  loadCurrentRun: vi.fn(),
  clearCurrentRun: vi.fn(),
  updateHoleScore: vi.fn(),
  getHoleScore: vi.fn((run, hole) => ({ strokes: 1, putts: 0, ...run.scorecard?.[hole] })),
  countScoredHoles: vi.fn((scorecard) => Object.keys(scorecard ?? {}).length),
  finishCurrentRound: vi.fn(),
}));

vi.mock('@app/storage/asyncStorage', () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}));

vi.mock('@app/watch/HudSyncService', () => ({
  syncHoleHud: vi.fn(),
}));

type Navigation = {
  navigate: ReturnType<typeof vi.fn>;
  setParams: ReturnType<typeof vi.fn>;
  goBack: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
};

type Route<Name extends string, Params> = {
  key: string;
  name: Name;
  params: Params;
};

function createNavigation(): Navigation {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
    reset: vi.fn(),
  } as unknown as Navigation;
}

function createRoute<Name extends string, Params>(name: Name, params: Params): Route<Name, Params> {
  return { key: name, name, params } as Route<Name, Params>;
}

describe('CourseSelectScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders hero courses and filters by search', async () => {
    vi.mocked(fetchHeroCourses).mockResolvedValue([
      { id: 'c1', name: 'Pebble Beach', country: 'USA', tees: [] },
      { id: 'c2', name: 'St Andrews', country: 'UK', tees: [] },
    ]);
    vi.mocked(getItem).mockResolvedValue(null);
    const navigation = createNavigation();

    render(
      <CourseSelectScreen navigation={navigation as any} route={createRoute('PlayCourseSelect', undefined)} />,
    );

    expect(await screen.findByText('Pebble Beach')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('course-search'), { target: { value: 'st a' } });

    expect(await screen.findByText('St Andrews')).toBeInTheDocument();
    expect(screen.queryByText('Pebble Beach')).toBeNull();
  });

  it('navigates to tee select on course tap', async () => {
    vi.mocked(fetchHeroCourses).mockResolvedValue([{ id: 'c1', name: 'Pebble Beach', tees: [] }]);
    vi.mocked(getItem).mockResolvedValue(null);
    const navigation = createNavigation();

    render(
      <CourseSelectScreen navigation={navigation as any} route={createRoute('PlayCourseSelect', undefined)} />,
    );

    fireEvent.click(await screen.findByTestId('course-c1'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('PlayTeeSelect', {
        courseId: 'c1',
        courseName: 'Pebble Beach',
        tees: [],
      });
    });
    expect(setItem).toHaveBeenCalled();
  });
});

describe('TeeSelectScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('starts a round with selected tee', async () => {
    vi.mocked(fetchCourseBundle).mockResolvedValue({
      id: 'c1',
      name: 'Pebble',
      tees: [
        { id: 't1', name: 'Blue', lengthMeters: 6000 },
        { id: 't2', name: 'White', lengthMeters: 5800 },
      ],
      holes: [
        { number: 1, par: 4, lengthMeters: 400 },
      ],
    });
    const navigation = createNavigation();

    render(
      <TeeSelectScreen
        navigation={navigation as any}
        route={createRoute('PlayTeeSelect', { courseId: 'c1', courseName: 'Pebble' })}
      />,
    );

    expect(await screen.findByText('Select your tee box')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tee-t1'));

    fireEvent.click(screen.getByTestId('start-round'));

    await waitFor(() => {
      expect(saveCurrentRun).toHaveBeenCalled();
      expect(navigation.navigate).toHaveBeenCalledWith('PlayInRound', expect.objectContaining({
        courseId: 'c1',
        courseName: 'Pebble',
        teeId: 't1',
        teeName: 'Blue',
      }));
    });
  });
});

describe('InRoundScreen', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(countScoredHoles).mockImplementation((scorecard) => Object.keys(scorecard ?? {}).length);
    vi.mocked(fetchAccessPlan).mockResolvedValue({ plan: 'pro' });
    vi.mocked(fetchPlayerProfile).mockResolvedValue({
      memberId: 'mem-1',
      name: 'Test',
      model: { playerType: 'balanced', style: null, strengths: [], weaknesses: [] },
      plan: { focusCategories: [], steps: [] },
    });
    vi.mocked(createRunForCurrentRound).mockResolvedValue({ runId: 'run-created' });
    vi.mocked(syncHoleHud).mockResolvedValue();
  });

  it('loads current run and advances holes', async () => {
    const run = {
      schemaVersion: 1,
      courseId: 'c1',
      courseName: 'Pebble',
      teeId: 't1',
      teeName: 'Blue',
      holes: 3,
      startedAt: '2024-01-01T00:00:00.000Z',
      mode: 'strokeplay' as const,
      currentHole: 1,
      scorecard: { 1: { strokes: 4, putts: 2, gir: false, fir: false } },
    };
    vi.mocked(loadCurrentRun).mockResolvedValue(run);
    vi.mocked(fetchCourseBundle).mockResolvedValue({
      id: 'c1',
      name: 'Pebble',
      tees: [{ id: 't1', name: 'Blue', lengthMeters: 6000 }],
      holes: [
        { number: 1, par: 4, lengthMeters: 400 },
        { number: 2, par: 3, lengthMeters: 150 },
      ],
    });
    vi.mocked(finishCurrentRound).mockResolvedValue({
      success: true,
      runId: 'run-1',
      summary: {
        runId: 'run-1',
        courseName: 'Pebble',
        teeName: 'Blue',
        holes: 3,
        totalStrokes: 2,
        finishedAt: '2024-01-01T00:00:00.000Z',
      },
    } as any);
    const navigation = createNavigation();

    render(<InRoundScreen navigation={navigation as any} route={createRoute('PlayInRound', {})} />);

    expect(await screen.findByTestId('hole-progress')).toHaveTextContent('Hole 1 of 3');

    await waitFor(() => {
      expect(syncHoleHud).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('next-hole'));

    await waitFor(() => {
      expect(saveCurrentRun).toHaveBeenCalledWith(expect.objectContaining({ currentHole: 2 }));
      expect(syncHoleHud).toHaveBeenLastCalledWith(
        expect.objectContaining({ currentHole: 2, courseId: 'c1', runId: 'run-created' }),
      );
    });
    expect(screen.getByTestId('hole-progress')).toHaveTextContent('Hole 2 of 3');

    expect(screen.getByTestId('holes-scored')).toHaveTextContent('Holes scored: 1 / 3');

    fireEvent.click(screen.getByTestId('finish-round'));
    fireEvent.click(screen.getByText('Finish & save'));
    await waitFor(() => {
      expect(finishCurrentRound).toHaveBeenCalled();
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 1,
        routes: [
          { name: 'PlayerHome' },
          { name: 'RoundStory', params: expect.objectContaining({ runId: 'run-1' }) },
        ],
      });
    });
  });
});
