import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import ClubSparkline from '../components/bag/ClubSparkline';

describe('ClubSparkline', () => {
  it('renders p50 marker in svg output', () => {
    const markup = renderToStaticMarkup(
      <ClubSparkline carries={[140, 150, 160, 170]} p25={145} p50={155} p75={165} />,
    );
    expect(markup).toContain('data-marker="p50"');
    expect(markup).toContain('<svg');
  });
});
