from __future__ import annotations

import csv
import datetime as dt
import importlib
import importlib.util
import json
import os
import random
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List, Optional, Sequence

import numpy as np

from cv_engine.inference.model_registry import get_detection_engine
from cv_engine.types import Box
from cv_engine.utils.img import to_uint8_rgb


@dataclass(frozen=True)
class Sample:
    image_id: str
    image_path: Path
    label_path: Path
    width: int
    height: int


@dataclass(frozen=True)
class PerImageResult:
    image_id: str
    tp: int
    fp: int
    fn: int
    best_iou: float
    best_conf: float
    latency_ms: float
    matched: bool


@dataclass(frozen=True)
class AggregateMetrics:
    tp: int
    fp: int
    fn: int
    precision: float
    recall: float
    f1: float
    trackable_rate: float
    mean_latency_ms: float


def _safe_div(numer: float, denom: float) -> float:
    return numer / denom if denom else 0.0


def _iou(a: Box, b: Box) -> float:
    inter_x1 = max(a.x1, b.x1)
    inter_y1 = max(a.y1, b.y1)
    inter_x2 = min(a.x2, b.x2)
    inter_y2 = min(a.y2, b.y2)
    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area == 0:
        return 0.0
    area_a = max(0, a.x2 - a.x1) * max(0, a.y2 - a.y1)
    area_b = max(0, b.x2 - b.x1) * max(0, b.y2 - b.y1)
    union_area = area_a + area_b - inter_area
    return _safe_div(inter_area, union_area)


def _load_yolo_labels(
    path: Path, *, width: int, height: int, class_filter: int = 0
) -> List[Box]:
    boxes: List[Box] = []
    if not path.exists():
        return boxes
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 5:
            continue
        cls_id = int(float(parts[0]))
        if cls_id != class_filter:
            continue
        x_center, y_center, w_norm, h_norm = map(float, parts[1:5])
        w = w_norm * width
        h = h_norm * height
        x1 = int(round(x_center * width - w / 2))
        y1 = int(round(y_center * height - h / 2))
        x2 = int(round(x_center * width + w / 2))
        y2 = int(round(y_center * height + h / 2))
        x1 = max(0, min(x1, width - 1))
        x2 = max(0, min(x2, width - 1))
        y1 = max(0, min(y1, height - 1))
        y2 = max(0, min(y2, height - 1))
        if x2 <= x1 or y2 <= y1:
            continue
        boxes.append(Box(x1, y1, x2, y2, "ball", 1.0))
    return boxes


def _require_imageio() -> object:
    if importlib.util.find_spec("imageio.v2") is None:
        raise RuntimeError("imageio is required for PNG/JPG benchmarks")
    return importlib.import_module("imageio.v2")


def _list_samples(dataset: Path) -> List[Sample]:
    images_dir = dataset / "images"
    labels_dir = dataset / "labels"
    if not images_dir.exists():
        raise FileNotFoundError(f"Missing images directory: {images_dir}")
    if not labels_dir.exists():
        raise FileNotFoundError(f"Missing labels directory: {labels_dir}")
    image_paths: List[Path] = []
    for ext in (".png", ".jpg", ".jpeg", ".npy"):
        image_paths.extend(images_dir.glob(f"*{ext}"))
    samples: List[Sample] = []
    for path in sorted(image_paths, key=lambda p: p.name):
        image_id = path.stem
        label_path = labels_dir / f"{image_id}.txt"
        if path.suffix == ".npy":
            arr = np.load(path, allow_pickle=False)
        else:
            iio = _require_imageio()
            arr = iio.imread(path)
        arr = to_uint8_rgb(arr)
        height, width = arr.shape[:2]
        samples.append(
            Sample(
                image_id=image_id,
                image_path=path,
                label_path=label_path,
                width=width,
                height=height,
            )
        )
    return samples


def _load_image(path: Path) -> np.ndarray:
    if path.suffix == ".npy":
        arr = np.load(path, allow_pickle=False)
    else:
        iio = _require_imageio()
        arr = iio.imread(path)
    return to_uint8_rgb(arr)


def _evaluate_sample(
    gt_boxes: Sequence[Box],
    pred_boxes: Sequence[Box],
    *,
    iou_threshold: float,
    conf_threshold: float,
) -> tuple[int, int, int, float, float, bool, int]:
    preds = [p for p in pred_boxes if p.score >= conf_threshold]
    if not gt_boxes:
        return (
            0,
            len(preds),
            0,
            0.0,
            max([p.score for p in preds], default=0.0),
            False,
            len(preds),
        )

    best_iou = 0.0
    best_conf = 0.0
    matched = False
    for pred in preds:
        best_conf = max(best_conf, pred.score)
        for gt in gt_boxes:
            iou = _iou(pred, gt)
            if iou > best_iou:
                best_iou = iou
            if iou >= iou_threshold:
                matched = True
    tp = 1 if matched else 0
    fn = 1 if not matched and gt_boxes else 0
    fp = len(preds) - tp if preds else 0
    return tp, fp, fn, best_iou, best_conf, matched, len(preds)


def evaluate_predictions(
    samples: Sequence[Sample],
    predictions: Sequence[Sequence[Box]],
    *,
    iou_threshold: float,
    conf_threshold: float,
) -> tuple[AggregateMetrics, List[PerImageResult]]:
    per_image: List[PerImageResult] = []
    tp_total = fp_total = fn_total = 0
    trackable = 0
    for sample, pred_boxes in zip(samples, predictions):
        gt_boxes = _load_yolo_labels(
            sample.label_path, width=sample.width, height=sample.height
        )
        tp, fp, fn, best_iou, best_conf, matched, pred_count = _evaluate_sample(
            gt_boxes,
            pred_boxes,
            iou_threshold=iou_threshold,
            conf_threshold=conf_threshold,
        )
        trackable += 1 if matched and pred_count == 1 else 0
        tp_total += tp
        fp_total += fp
        fn_total += fn
        per_image.append(
            PerImageResult(
                image_id=sample.image_id,
                tp=tp,
                fp=fp,
                fn=fn,
                best_iou=best_iou,
                best_conf=best_conf,
                latency_ms=0.0,
                matched=matched,
            )
        )
    precision = _safe_div(tp_total, tp_total + fp_total)
    recall = _safe_div(tp_total, tp_total + fn_total)
    f1 = _safe_div(2 * precision * recall, precision + recall)
    metrics = AggregateMetrics(
        tp=tp_total,
        fp=fp_total,
        fn=fn_total,
        precision=precision,
        recall=recall,
        f1=f1,
        trackable_rate=_safe_div(trackable, len(samples)),
        mean_latency_ms=0.0,
    )
    return metrics, per_image


def run_model(
    samples: Sequence[Sample],
    *,
    model_id: str,
    weight_path: Optional[str],
    iou_threshold: float,
    conf_threshold: float,
    seed: int,
    max_images: Optional[int],
) -> tuple[AggregateMetrics, List[PerImageResult]]:
    rng = random.Random(seed)
    ordered_samples = list(samples)
    rng.shuffle(ordered_samples)
    if max_images is not None:
        ordered_samples = ordered_samples[:max_images]

    engine = get_detection_engine(
        variant=model_id,
        variant_source="benchmark cli",
        weight_path=weight_path,
    )
    predictions: List[List[Box]] = []
    latency_ms_values: List[float] = []
    for sample in ordered_samples:
        image = _load_image(sample.image_path)
        start = time.perf_counter()
        boxes = list(engine.detect(image))
        elapsed_ms = (time.perf_counter() - start) * 1000
        latency_ms_values.append(elapsed_ms)
        predictions.append(boxes)

    metrics, per_image = evaluate_predictions(
        ordered_samples,
        predictions,
        iou_threshold=iou_threshold,
        conf_threshold=conf_threshold,
    )
    updated_per_image: List[PerImageResult] = []
    for item, latency_ms in zip(per_image, latency_ms_values):
        updated_per_image.append(
            PerImageResult(
                image_id=item.image_id,
                tp=item.tp,
                fp=item.fp,
                fn=item.fn,
                best_iou=item.best_iou,
                best_conf=item.best_conf,
                latency_ms=latency_ms,
                matched=item.matched,
            )
        )
    mean_latency = _safe_div(sum(latency_ms_values), len(latency_ms_values))
    metrics = AggregateMetrics(
        tp=metrics.tp,
        fp=metrics.fp,
        fn=metrics.fn,
        precision=metrics.precision,
        recall=metrics.recall,
        f1=metrics.f1,
        trackable_rate=metrics.trackable_rate,
        mean_latency_ms=mean_latency,
    )
    return metrics, updated_per_image


def _metrics_payload(
    *,
    model_id: str,
    metrics: AggregateMetrics,
    per_image: Sequence[PerImageResult],
) -> dict:
    return {
        "model_id": model_id,
        "metrics": asdict(metrics),
        "per_image": [asdict(item) for item in per_image],
    }


def _format_float(value: float, digits: int = 3) -> str:
    return f"{value:.{digits}f}"


def _write_summary(
    outdir: Path,
    *,
    model_a: str,
    model_b: str,
    metrics_a: AggregateMetrics,
    metrics_b: AggregateMetrics,
    iou_threshold: float,
    conf_threshold: float,
) -> None:
    rows = [
        ("Precision", metrics_a.precision, metrics_b.precision),
        ("Recall", metrics_a.recall, metrics_b.recall),
        ("F1", metrics_a.f1, metrics_b.f1),
        ("TP", float(metrics_a.tp), float(metrics_b.tp)),
        ("FP", float(metrics_a.fp), float(metrics_b.fp)),
        ("FN", float(metrics_a.fn), float(metrics_b.fn)),
        ("Trackable Rate", metrics_a.trackable_rate, metrics_b.trackable_rate),
        ("Mean Latency (ms)", metrics_a.mean_latency_ms, metrics_b.mean_latency_ms),
    ]
    lines = [
        "# Benchmark Summary",
        "",
        f"- IoU threshold: {iou_threshold}",
        f"- Confidence threshold: {conf_threshold}",
        "",
        "| Metric | Model A | Model B | Delta (B-A) |",
        "| --- | --- | --- | --- |",
    ]
    for name, val_a, val_b in rows:
        delta = val_b - val_a
        lines.append(
            f"| {name} | {_format_float(val_a)} | {_format_float(val_b)} | {_format_float(delta)} |"
        )
    lines.append("")
    lines.append(f"Model A: `{model_a}`")
    lines.append(f"Model B: `{model_b}`")
    outdir.joinpath("summary.md").write_text("\n".join(lines))


def _write_metrics_json(
    outdir: Path,
    *,
    model_a: str,
    model_b: str,
    metrics_a: AggregateMetrics,
    metrics_b: AggregateMetrics,
    per_image_a: Sequence[PerImageResult],
    per_image_b: Sequence[PerImageResult],
    iou_threshold: float,
    conf_threshold: float,
    seed: int,
    dataset: Path,
) -> None:
    payload = {
        "metadata": {
            "timestamp": dt.datetime.utcnow().isoformat() + "Z",
            "git_sha": os.getenv("GIT_SHA") or os.getenv("GITHUB_SHA"),
            "dataset": str(dataset),
            "iou_threshold": iou_threshold,
            "conf_threshold": conf_threshold,
            "seed": seed,
        },
        "model_a": _metrics_payload(
            model_id=model_a, metrics=metrics_a, per_image=per_image_a
        ),
        "model_b": _metrics_payload(
            model_id=model_b, metrics=metrics_b, per_image=per_image_b
        ),
    }
    outdir.joinpath("metrics.json").write_text(json.dumps(payload, indent=2))


def _write_per_image_csv(
    outdir: Path,
    *,
    label: str,
    per_image: Sequence[PerImageResult],
) -> None:
    path = outdir / f"per_image_{label}.csv"
    with path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "image_id",
                "tp",
                "fp",
                "fn",
                "best_iou",
                "best_conf",
                "latency_ms",
                "matched",
            ]
        )
        for item in per_image:
            writer.writerow(
                [
                    item.image_id,
                    item.tp,
                    item.fp,
                    item.fn,
                    f"{item.best_iou:.6f}",
                    f"{item.best_conf:.6f}",
                    f"{item.latency_ms:.3f}",
                    item.matched,
                ]
            )


def run_comparison(
    *,
    dataset: Path,
    model_a: str,
    model_b: str,
    weight_a: Optional[str] = None,
    weight_b: Optional[str] = None,
    iou_threshold: float = 0.5,
    conf_threshold: float = 0.25,
    max_images: Optional[int] = None,
    outdir: Path = Path("bench_out"),
    seed: int = 1337,
    write_csv: bool = False,
) -> dict:
    samples = _list_samples(dataset)
    if not samples:
        raise RuntimeError(f"No samples found under {dataset}")
    outdir.mkdir(parents=True, exist_ok=True)
    metrics_a, per_image_a = run_model(
        samples,
        model_id=model_a,
        weight_path=weight_a,
        iou_threshold=iou_threshold,
        conf_threshold=conf_threshold,
        seed=seed,
        max_images=max_images,
    )
    metrics_b, per_image_b = run_model(
        samples,
        model_id=model_b,
        weight_path=weight_b,
        iou_threshold=iou_threshold,
        conf_threshold=conf_threshold,
        seed=seed,
        max_images=max_images,
    )
    _write_metrics_json(
        outdir,
        model_a=model_a,
        model_b=model_b,
        metrics_a=metrics_a,
        metrics_b=metrics_b,
        per_image_a=per_image_a,
        per_image_b=per_image_b,
        iou_threshold=iou_threshold,
        conf_threshold=conf_threshold,
        seed=seed,
        dataset=dataset,
    )
    _write_summary(
        outdir,
        model_a=model_a,
        model_b=model_b,
        metrics_a=metrics_a,
        metrics_b=metrics_b,
        iou_threshold=iou_threshold,
        conf_threshold=conf_threshold,
    )
    if write_csv:
        _write_per_image_csv(outdir, label="a", per_image=per_image_a)
        _write_per_image_csv(outdir, label="b", per_image=per_image_b)
    return {
        "model_a": metrics_a,
        "model_b": metrics_b,
        "per_image_a": per_image_a,
        "per_image_b": per_image_b,
    }
