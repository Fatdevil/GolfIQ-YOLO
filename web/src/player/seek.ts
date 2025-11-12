export type PlayerOpenDetail = {
  clipId: string;
  tMs: number;
};

/** Open the clip in our player modal/page and seek to a millisecond offset. */
export function openAndSeekTo({ clipId, tStartMs }: { clipId: string; tStartMs: number }) {
  const safeMs = Math.max(0, Math.floor(tStartMs));
  const url = `/clips/${clipId}?t=${safeMs}`;
  window.dispatchEvent(new CustomEvent<PlayerOpenDetail>('player:open', { detail: { clipId, tMs: safeMs } }));
  try {
    window.history.pushState({}, '', url);
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('Failed to pushState for clip seek', err);
    }
  }
}
