import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import { ClipPlayer } from '@web/features/clips/Player';

describe('ClipPlayer anchors', () => {
  it('seeks to the anchor when clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<ClipPlayer src="/clip.mp4" anchors={[4.5, 8.2]} />);
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true });

    await user.click(screen.getByText('4.5s'));
    expect(video.currentTime).toBeCloseTo(4.5, 2);

    await user.click(screen.getByText('8.2s'));
    expect(video.currentTime).toBeCloseTo(8.2, 2);
  });
});
