from __future__ import annotations

import argparse
from pathlib import Path

from cv_engine.bench.benchmark import run_comparison


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark YOLO detectors.")
    sub = parser.add_subparsers(dest="command", required=True)

    compare = sub.add_parser("compare", help="Compare two model variants.")
    compare.add_argument("--dataset", required=True, type=Path)
    compare.add_argument("--model-a", required=True, dest="model_a")
    compare.add_argument("--model-b", required=True, dest="model_b")
    compare.add_argument("--weight-a", default=None)
    compare.add_argument("--weight-b", default=None)
    compare.add_argument("--iou-threshold", type=float, default=0.5)
    compare.add_argument("--conf-threshold", type=float, default=0.25)
    compare.add_argument("--max-images", type=int, default=None)
    compare.add_argument("--outdir", type=Path, default=Path("bench_out"))
    compare.add_argument("--seed", type=int, default=1337)
    compare.add_argument("--write-csv", action="store_true")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "compare":
        run_comparison(
            dataset=args.dataset,
            model_a=args.model_a,
            model_b=args.model_b,
            weight_a=args.weight_a,
            weight_b=args.weight_b,
            iou_threshold=args.iou_threshold,
            conf_threshold=args.conf_threshold,
            max_images=args.max_images,
            outdir=args.outdir,
            seed=args.seed,
            write_csv=args.write_csv,
        )
        return 0
    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
