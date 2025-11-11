export type StartTiming = {
  reqTs: number;
  firstFrameTs: number;
  play_start_ms: number;
  live: boolean;
  src: string;
};

export function measureStart(
  videoEl: HTMLVideoElement,
  { live, src }: { live: boolean; src: string },
  emit: (timing: StartTiming) => void,
): () => void {
  const reqTs = performance.now();

  const onFirstFrame = () => {
    const firstFrameTs = performance.now();
    videoEl.removeEventListener('playing', onFirstFrame);
    emit({
      reqTs,
      firstFrameTs,
      play_start_ms: Math.round(firstFrameTs - reqTs),
      live,
      src,
    });
  };

  videoEl.addEventListener('playing', onFirstFrame);

  return () => {
    videoEl.removeEventListener('playing', onFirstFrame);
  };
}
