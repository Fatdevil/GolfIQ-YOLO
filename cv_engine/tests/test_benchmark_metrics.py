from __future__ import annotations

from pathlib import Path

import numpy as np

from cv_engine.bench import benchmark
from cv_engine.types import Box


def _write_yolo_label(path: Path, *, x: float, y: float, w: float, h: float) -> None:
    path.write_text(f"0 {x} {y} {w} {h}\n")


def _write_image(path: Path, *, width: int = 100, height: int = 100) -> None:
    arr = np.zeros((height, width, 3), dtype=np.uint8)
    np.save(path, arr)


def test_benchmark_metrics_basic(tmp_path: Path) -> None:
    dataset = tmp_path / "dataset"
    images = dataset / "images"
    labels = dataset / "labels"
    images.mkdir(parents=True)
    labels.mkdir(parents=True)

    _write_image(images / "img_a.npy")
    _write_image(images / "img_b.npy")
    _write_yolo_label(labels / "img_a.txt", x=0.5, y=0.5, w=0.2, h=0.2)
    _write_yolo_label(labels / "img_b.txt", x=0.5, y=0.5, w=0.2, h=0.2)

    samples = benchmark._list_samples(dataset)
    assert [sample.image_id for sample in samples] == ["img_a", "img_b"]

    pred_a = Box(40, 40, 60, 60, "ball", 0.9)
    pred_b = Box(10, 10, 20, 20, "ball", 0.1)
    metrics, per_image = benchmark.evaluate_predictions(
        samples,
        [[pred_a], [pred_b]],
        iou_threshold=0.5,
        conf_threshold=0.25,
    )

    assert metrics.tp == 1
    assert metrics.fp == 0
    assert metrics.fn == 1
    assert metrics.precision == 1.0
    assert metrics.recall == 0.5
    assert round(metrics.f1, 3) == 0.667
    assert metrics.trackable_rate == 0.5
    assert metrics.mean_latency_ms == 0.0
    assert per_image[0].matched is True
    assert per_image[1].matched is False
