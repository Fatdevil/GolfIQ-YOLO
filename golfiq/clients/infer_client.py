#!/usr/bin/env python3
"""Send a folder of images to /infer in frames_b64 mode."""
import argparse
import base64
import os

import requests


def load_frames(folder):
    frames = []
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        path = os.path.join(folder, name)
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        frames.append({"image_b64": b64})
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:8000", help="Server base URL")
    ap.add_argument("--frames", required=True, help="Folder with images")
    ap.add_argument("--fps", type=float, default=120.0)
    ap.add_argument("--scale", type=float, default=0.002)
    ap.add_argument("--model", required=True, help="Server path to yolov8n.pt")
    args = ap.parse_args()

    payload = {
        "mode": "frames_b64",
        "frames": load_frames(args.frames),
        "meta": {
            "fps": args.fps,
            "scale_m_per_px": args.scale,
            "calibrated": True,
            "view": "DTL",
        },
        "yolo": {
            "model_path": args.model,
            "class_map": {"0": "ball", "1": "club_head"},
            "conf": 0.25,
        },
    }
    r = requests.post(args.api + "/infer", json=payload, timeout=60)
    print(r.status_code, r.text)


if __name__ == "__main__":
    main()
