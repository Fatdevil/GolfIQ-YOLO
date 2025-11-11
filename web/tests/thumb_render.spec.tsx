import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ClipCard } from '@web/features/clips/ClipCard';
import { ClipPlayer } from '@web/features/clips/Player';

describe('thumbnail rendering', () => {
  it('shows thumbnail image and preloads on hover', () => {
    render(
      <ClipCard
        clip={{
          id: 'clip-1',
          playerName: 'Player One',
          createdAt: '2024-01-01T00:00:00Z',
          thumbUrl: 'https://cdn.test/thumb.jpg',
        }}
      />,
    );

    const button = screen.getByRole('button');
    fireEvent.mouseEnter(button);

    const image = screen.getByAltText('Player One') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('https://cdn.test/thumb.jpg');
    const preload = document.head.querySelector('link[rel="preload"][href="https://cdn.test/thumb.jpg"]');
    expect(preload).not.toBeNull();
  });

  it('assigns poster attribute to clip player', () => {
    const { container } = render(
      <ClipPlayer src="https://cdn.test/master.m3u8" poster="https://cdn.test/thumb.jpg" anchors={null} />,
    );

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    expect(video?.getAttribute('poster')).toBe('https://cdn.test/thumb.jpg');
  });
});
