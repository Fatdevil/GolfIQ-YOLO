import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RangeSessionStoryCard } from '@app/range/RangeSessionStoryCard';
import type { RangeSessionStory } from '@app/range/rangeSessionStory';

describe('RangeSessionStoryCard', () => {
  it('renders title and bullet sections', () => {
    const story: RangeSessionStory = {
      titleKey: 'range.story.solid_distance_work_on_direction',
      focusArea: 'direction',
      strengths: ['range.story.strengths.solid_distance', 'range.story.strengths.good_volume'],
      improvements: ['range.story.improvements.direction'],
    };

    render(<RangeSessionStoryCard story={story} />);

    expect(screen.getByTestId('range-session-story')).toBeTruthy();
    expect(screen.getByText('Solid distance – now tighten your direction')).toBeTruthy();
    expect(screen.getByText('What you did well')).toBeTruthy();
    expect(screen.getByText('What to focus on next')).toBeTruthy();
    expect(screen.getByText('Your average carry was close to the target.')).toBeTruthy();
    expect(screen.getByText('You hit enough balls to learn something from this bucket.')).toBeTruthy();
    expect(screen.getByText('Pick a smaller target and work on start line.')).toBeTruthy();
  });
});
