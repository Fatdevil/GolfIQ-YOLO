import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef } from "react";

import Hls from "hls.js";

import type { ShotClip } from "@web/features/clips/types";
import { cn } from "@web/lib/cn";

type ClipModalProps = {
  clip: ShotClip | null;
  open: boolean;
  onClose: () => void;
};

function usePortalTarget(): HTMLElement | null {
  return useMemo(() => {
    if (typeof document === "undefined") {
      return null;
    }
    const existing = document.getElementById("clip-modal-root");
    if (existing) {
      return existing;
    }
    const node = document.createElement("div");
    node.id = "clip-modal-root";
    document.body.appendChild(node);
    return node;
  }, []);
}

export default function ClipModal({ clip, open, onClose }: ClipModalProps): JSX.Element | null {
  const target = usePortalTarget();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!open) {
      return () => undefined;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !clip) {
      return () => undefined;
    }
    const video = videoRef.current;
    if (!video) {
      return () => undefined;
    }
    let hls: Hls | null = null;
    if (clip.hlsUrl && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(clip.hlsUrl);
      hls.attachMedia(video);
    } else if (clip.hlsUrl && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = clip.hlsUrl;
    } else if (clip.mp4Url) {
      video.src = clip.mp4Url;
    }
    void video.play().catch(() => undefined);
    return () => {
      if (hls) {
        hls.destroy();
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [clip, open]);

  if (!target || !open || !clip) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-lg bg-slate-900 shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Top Shot</h2>
            {clip.hole && <p className="text-sm text-slate-400">Hole {clip.hole}</p>}
          </div>
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-sm text-slate-200 hover:bg-slate-700"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <div className="aspect-video bg-black">
          <video ref={videoRef} controls playsInline className={cn("h-full w-full", !clip.hlsUrl && "bg-slate-950")}></video>
        </div>
      </div>
    </div>,
    target,
  );
}
