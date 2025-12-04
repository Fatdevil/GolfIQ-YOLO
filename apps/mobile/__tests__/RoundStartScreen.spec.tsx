import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import RoundStartScreen from '@app/screens/RoundStartScreen';
import { getCurrentRound, listRounds, startRound } from '@app/api/roundClient';
import { saveActiveRoundState } from '@app/round/roundState';

type Nav = { navigate: (...args: any[]) => void };

vi.mock('@app/api/roundClient');
vi.mock('@app/round/roundState');

const mockedStartRound = startRound as unknown as Mock;
const mockedSaveState = saveActiveRoundState as unknown as Mock;
const mockedGetCurrentRound = getCurrentRound as unknown as Mock;
const mockedListRounds = listRounds as unknown as Mock;

beforeEach(() => {
  mockedStartRound.mockResolvedValue({ id: 'r1', holes: 18, startedAt: 'now', startHole: 1 });
  mockedSaveState.mockResolvedValue(undefined);
  mockedGetCurrentRound.mockResolvedValue({
    id: 'r1',
    holes: 18,
    startHole: 1,
    status: 'in_progress',
    startedAt: 'today',
  });
  mockedListRounds.mockResolvedValue([]);
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
    });
    expect(navigation.navigate).toHaveBeenCalledWith('RoundShot', { roundId: 'new-round' });
  });
});
