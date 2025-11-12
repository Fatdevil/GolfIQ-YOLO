export type PlayerOpenDetail = {
  clipId: string;
  tMs: number;
};

type OpenAndSeekOptions = {
  clipId: string;
  tStartMs: number;
  pushUrl?: boolean;
};

/** Open the clip in our player modal/page and seek to a millisecond offset. */
export function openAndSeekTo({ clipId, tStartMs, pushUrl = false }: OpenAndSeekOptions) {
  const safeMs = Math.max(0, Math.floor(tStartMs));
  window.dispatchEvent(
    new CustomEvent<PlayerOpenDetail>('player:open', { detail: { clipId, tMs: safeMs } }),
  );
  if (!pushUrl) {
    return;
  }
  try {
    window.history.pushState({}, '', `/clip/${clipId}?t=${safeMs}`);
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('Failed to pushState for clip seek', err);
    }
  }
}
