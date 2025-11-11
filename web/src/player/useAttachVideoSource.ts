import { useEffect, type RefObject } from 'react';

import { buildHlsConfig } from './hlsConfig';

const HLS_MIME = 'application/vnd.apple.mpegurl';

type Options = {
  videoRef: RefObject<HTMLVideoElement | null>;
  src?: string | null;
  live?: boolean;
};

export function useAttachVideoSource({ videoRef, src, live = false }: Options): void {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return () => undefined;
    }

    let hlsInstance: import('hls.js').default | null = null;
    let cancelled = false;

    const resetSource = () => {
      video.removeAttribute('src');
      video.load();
    };

    if (!src) {
      resetSource();
      return () => {
        cancelled = true;
        if (hlsInstance) {
          hlsInstance.destroy();
          hlsInstance = null;
        }
        resetSource();
      };
    }

    if (video.canPlayType(HLS_MIME)) {
      video.src = src;
      video.load();
      return () => {
        cancelled = true;
        resetSource();
      };
    }

    void (async () => {
      const { default: Hls } = await import('hls.js');
      if (cancelled) {
        return;
      }
      if (!Hls.isSupported()) {
        video.src = src;
        video.load();
        return;
      }
      const config = buildHlsConfig({ live });
      hlsInstance = new Hls(config);
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(video);
    })();

    return () => {
      cancelled = true;
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      resetSource();
    };
  }, [videoRef, src, live]);
}
