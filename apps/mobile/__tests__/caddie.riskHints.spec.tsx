import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CaddieRiskHintsCard } from '@app/components/CaddieRiskHintsCard';
import * as caddieApi from '@app/api/caddieApi';

vi.mock('@app/api/caddieApi', () => ({
  fetchShotShapeProfile: vi.fn(),
}));

describe('CaddieRiskHintsCard', () => {
  beforeEach(() => {
    vi.mocked(caddieApi.fetchShotShapeProfile).mockReset();
  });

  it('renders risk summary for the selected club and intent', async () => {
    vi.mocked(caddieApi.fetchShotShapeProfile).mockResolvedValue({
      club: '7i',
      intent: 'straight',
      coreCarryMeanM: 150,
      coreCarryStdM: 5,
      coreSideMeanM: -2,
      coreSideStdM: 4,
      tailLeftProb: 0.05,
      tailRightProb: 0,
    });

    render(<CaddieRiskHintsCard clubs={['7i', '8i']} />);

    expect(await screen.findByTestId('caddie-risk-core')).toBeInTheDocument();
    expect(screen.getByText(/Core window/)).toBeInTheDocument();
    expect(screen.getByTestId('caddie-risk-left')).toHaveTextContent('5%');
  });

  it('updates profile when intent is changed', async () => {
    vi.mocked(caddieApi.fetchShotShapeProfile)
      .mockResolvedValueOnce({
        club: '7i',
        intent: 'straight',
        coreCarryMeanM: 150,
        coreCarryStdM: 0,
        coreSideMeanM: 0,
        coreSideStdM: 0,
        tailLeftProb: 0,
        tailRightProb: 0,
      })
      .mockResolvedValueOnce({
        club: '7i',
        intent: 'fade',
        coreCarryMeanM: 148,
        coreCarryStdM: 4,
        coreSideMeanM: 3,
        coreSideStdM: 2,
        tailLeftProb: 0.02,
        tailRightProb: 0.01,
      });

    render(<CaddieRiskHintsCard clubs={['7i']} />);

    const fadeChip = await screen.findByText('fade');
    fireEvent.click(fadeChip);

    await waitFor(() => {
      expect(caddieApi.fetchShotShapeProfile).toHaveBeenLastCalledWith('7i', 'fade');
    });
    expect(await screen.findByTestId('caddie-risk-core')).toHaveTextContent('143 m–153 m');
  });
});
