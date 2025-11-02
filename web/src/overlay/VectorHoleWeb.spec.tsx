import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { BagStats } from '../../../shared/bag/types';
import type { VectorHoleModel } from '../../../shared/overlay/vector';
import VectorHoleWeb from './VectorHoleWeb';

const TEST_BAG: BagStats = {
  updatedAt: 0,
  clubs: {
    D: {
      club: 'D',
      samples: 20,
      meanCarry_m: 255,
      p25_m: 240,
      p50_m: 260,
      p75_m: 275,
      std_m: 11,
      sgPerShot: 0,
    },
  },
};

const TEST_HOLE: VectorHoleModel = {
  id: 'demo',
  fairways: [
    [
      [
        { x: -10, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 150 },
        { x: -20, y: 150 },
      ],
    ],
  ],
  greens: [
    [
      [
        { x: -6, y: 160 },
        { x: 6, y: 160 },
        { x: 8, y: 190 },
        { x: -8, y: 190 },
      ],
    ],
  ],
  bunkers: [
    [
      [
        { x: -18, y: 110 },
        { x: -10, y: 110 },
        { x: -8, y: 128 },
        { x: -18, y: 128 },
      ],
    ],
  ],
  waters: [
    [
      [
        { x: 12, y: 60 },
        { x: 22, y: 60 },
        { x: 24, y: 120 },
        { x: 12, y: 120 },
      ],
    ],
  ],
};

describe('VectorHoleWeb', () => {
  it('renders corridor and ring when toggled on', () => {
    const markup = renderToStaticMarkup(
      <VectorHoleWeb
        holeModel={TEST_HOLE}
        teeXY={{ x: 0, y: 0 }}
        targetXY={{ x: 0, y: 180 }}
        bag={TEST_BAG}
        club="D"
        showCorridor
        showRing
        labelsAllowed
        size={{ w: 320, h: 220 }}
      />,
    );
    expect(markup).toContain('vector-overlay__corridor');
    expect(markup).toContain('vector-overlay__ring');
  });

  it('suppresses corridor and ring when toggles are off', () => {
    const markup = renderToStaticMarkup(
      <VectorHoleWeb
        holeModel={TEST_HOLE}
        teeXY={{ x: 0, y: 0 }}
        targetXY={{ x: 0, y: 180 }}
        bag={TEST_BAG}
        club="D"
        showCorridor={false}
        showRing={false}
        labelsAllowed={false}
        size={{ w: 320, h: 220 }}
      />,
    );
    expect(markup).not.toContain('vector-overlay__corridor');
    expect(markup).not.toContain('vector-overlay__ring');
  });
});
