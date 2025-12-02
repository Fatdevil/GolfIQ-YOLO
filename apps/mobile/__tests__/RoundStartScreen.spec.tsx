import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';

import RoundStartScreen from '@app/screens/RoundStartScreen';
import { startRound } from '@app/api/roundClient';
import { saveActiveRoundState } from '@app/round/roundState';

type Nav = { navigate: (...args: any[]) => void };

vi.mock('@app/api/roundClient');
vi.mock('@app/round/roundState');

const mockedStartRound = startRound as unknown as Mock;
const mockedSaveState = saveActiveRoundState as unknown as Mock;

mockedStartRound.mockResolvedValue({ id: 'r1', holes: 18, startedAt: 'now' });
mockedSaveState.mockResolvedValue(undefined);

describe('RoundStartScreen', () => {
  it('starts a round and navigates to shot logging', async () => {
    const navigation: Nav = { navigate: vi.fn() };

    const { getByTestId, getByPlaceholderText } = render(
      <RoundStartScreen navigation={navigation as any} route={undefined as any} />,
    );

    fireEvent.change(getByPlaceholderText('Course name or id'), { target: { value: 'Pine Valley' } });
    fireEvent.click(getByTestId('start-round-button'));

    await waitFor(() => expect(mockedStartRound).toHaveBeenCalled());
    expect(mockedSaveState).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('RoundShot', { roundId: 'r1' });
  });
});
