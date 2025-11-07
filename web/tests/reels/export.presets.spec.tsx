import { useEffect, useState } from 'react';

import type { ReelUserOptions } from '@shared/reels/types';
import * as telemetry from '@shared/telemetry/reels';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __EXPORT_OPTIONS_STORAGE_KEY,
  __sanitizeExportOptionsForTest,
  __loadStoredExportOptionsForTest,
} from '../../src/features/reels/Composer';
import ExportModal from '../../src/features/reels/export/ExportModal';
import { REEL_EXPORT_PRESETS } from '../../src/features/reels/export/templates';

type HarnessProps = {
  onSubmit?: (options: ReelUserOptions) => void;
};

function ExportModalHarness(props: HarnessProps): JSX.Element {
  const { onSubmit } = props;
  const [options, setOptions] = useState<ReelUserOptions>(() => __loadStoredExportOptionsForTest());
  const [includeBadges, setIncludeBadges] = useState(true);

  useEffect(() => {
    const sanitized = __sanitizeExportOptionsForTest(options);
    window.localStorage.setItem(__EXPORT_OPTIONS_STORAGE_KEY, JSON.stringify(sanitized));
  }, [options]);

  return (
    <ExportModal
      open
      presets={REEL_EXPORT_PRESETS}
      options={options}
      onOptionsChange={(next) => setOptions(__sanitizeExportOptionsForTest(next))}
      onSubmit={(next) => {
        const sanitized = __sanitizeExportOptionsForTest(next);
        setOptions(sanitized);
        onSubmit?.(sanitized);
      }}
      onClose={() => {}}
      exporting={false}
      exportProgress={0.25}
      exportStatus={null}
      durationMs={5200}
      includeBadges={includeBadges}
      onIncludeBadgesChange={setIncludeBadges}
      onCancel={() => {}}
      downloadUrl={null}
      downloadName={null}
      durationWarning="Heads up: clip length exceeds target"
    />
  );
}

describe('reels export presets modal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders presets, toggles, and caption input', async () => {
    const user = userEvent.setup();
    render(<ExportModalHarness />);

    expect(screen.getByText('TikTok 1080×1920 · 60fps')).toBeTruthy();
    expect(screen.getByText('Heads up: clip length exceeds target')).toBeTruthy();

    const watermarkToggle = screen.getAllByLabelText('Watermark overlay')[0] as HTMLInputElement;
    const audioToggle = screen.getAllByLabelText('Include audio bed')[0] as HTMLInputElement;
    const badgesToggle = screen.getAllByLabelText('Carry & club badges')[0] as HTMLInputElement;

    expect(watermarkToggle.checked).toBe(true);
    expect(audioToggle.checked).toBe(false);
    expect(badgesToggle.checked).toBe(true);

    const captionInput = screen.getAllByPlaceholderText('Add a caption to stash for sharing later')[0] as HTMLInputElement;
    await user.type(captionInput, 'Test{space}caption');
    expect(captionInput.value.length).toBeGreaterThan(0);
  });

  it('persists selections to localStorage and reloads them', async () => {
    const user = userEvent.setup();
    const submitSpy = vi.fn();
    const { unmount } = render(<ExportModalHarness onSubmit={submitSpy} />);

    const reelsPreset = screen.getAllByDisplayValue('reels_1080x1920_30')[0] as HTMLInputElement;
    await user.click(reelsPreset);

    const watermarkToggle = screen.getAllByLabelText('Watermark overlay')[0] as HTMLInputElement;
    const audioToggle = screen.getAllByLabelText('Include audio bed')[0] as HTMLInputElement;
    await user.click(watermarkToggle);
    await user.click(audioToggle);

    const captionInput = screen.getAllByPlaceholderText('Add a caption to stash for sharing later')[0] as HTMLInputElement;
    await user.clear(captionInput);
    await user.type(captionInput, 'This is a very long caption that should be trimmed at eighty characters total for storage.');

    await waitFor(() => {
      const raw = window.localStorage.getItem(__EXPORT_OPTIONS_STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw ?? '{}') as ReelUserOptions;
      expect(parsed.presetId).toBe('reels_1080x1920_30');
      expect(parsed.watermark).toBe(false);
      expect(parsed.audio).toBe(true);
      expect(typeof parsed.caption === 'string' ? parsed.caption.length <= 80 : parsed.caption).toBeTruthy();
    });

    unmount();

    render(<ExportModalHarness onSubmit={submitSpy} />);

    const presetRadio = screen.getAllByDisplayValue('reels_1080x1920_30')[0] as HTMLInputElement;
    expect(presetRadio.checked).toBe(true);
    expect((screen.getAllByLabelText('Watermark overlay')[0] as HTMLInputElement).checked).toBe(false);
    expect((screen.getAllByLabelText('Include audio bed')[0] as HTMLInputElement).checked).toBe(true);
  });

  it('emits telemetry when options change and submit', async () => {
    const user = userEvent.setup();
    const openedSpy = vi.spyOn(telemetry, 'emitReelExportOpened').mockImplementation(() => {});
    const optionsSpy = vi.spyOn(telemetry, 'emitReelExportOptions').mockImplementation(() => {});
    const submittedSpy = vi.spyOn(telemetry, 'emitReelExportSubmitted').mockImplementation(() => {});
    const submitSpy = vi.fn();

    render(<ExportModalHarness onSubmit={submitSpy} />);

    expect(openedSpy).toHaveBeenCalledTimes(1);
    expect(optionsSpy).toHaveBeenCalled();

    await user.click(screen.getAllByDisplayValue('shorts_1080x1920_60')[0]!);
    await waitFor(() => {
      const lastCall = optionsSpy.mock.calls.at(-1)?.[0];
      expect(lastCall?.presetId).toBe('shorts_1080x1920_60');
    });

    const captionInput = screen.getAllByPlaceholderText('Add a caption to stash for sharing later')[0]!;
    await user.type(captionInput, 'Ready for launch');

    await waitFor(() => {
      const lastCall = optionsSpy.mock.calls.at(-1)?.[0];
      expect(lastCall?.hasCaption).toBe(true);
    });

    const initialSubmitCalls = submittedSpy.mock.calls.length;
    const startButtons = screen.getAllByRole('button', { name: 'Start export' });
    await user.click(startButtons[startButtons.length - 1]!);

    await waitFor(() => {
      expect(submittedSpy.mock.calls.length).toBeGreaterThan(initialSubmitCalls);
    });

    expect(submitSpy).toHaveBeenCalled();
  });
});
