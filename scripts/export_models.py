#!/usr/bin/env python3
# Lightweight export + micro-bench.
# Works even without torch by building a tiny ONNX graph programmatically.
import argparse
import datetime
import json
import os
import platform
import time

import numpy as np

REPORT_PATH_DEFAULT = "models/EXPORT_REPORT.md"


def ensure_dir(p):
    os.makedirs(os.path.dirname(p), exist_ok=True)


def log_and_capture(lines, s):
    print(s, flush=True)
    lines.append(s)


def downgrade_ir(path: str, max_ir: int = 8):
    import onnx

    model = onnx.load(path)
    if getattr(model, "ir_version", 0) > max_ir:
        model.ir_version = max_ir
        onnx.save(model, path)


def export_onnx(dummy_shape=(1, 3, 320, 320), iters=25, lines=None):
    try:
        import onnx
        import onnxruntime as ort
    except Exception as e:
        if lines is not None:
            log_and_capture(lines, f"ONNX: unavailable: {e}")
        return {"target": "ONNX", "status": "unavailable", "reason": str(e)}

    onnx_path = "models/tmp_tiny.onnx"
    os.makedirs("models", exist_ok=True)

    # Try PyTorch tiny model first; if torch missing, fall back to programmatic ONNX graph.
    used = "torch"
    try:
        import torch
        import torch.nn as nn

        class Tiny(nn.Module):
            def __init__(self):
                super().__init__()
                self.conv = nn.Conv2d(3, 8, 3, padding=1)
                self.act = nn.ReLU()
                self.pool = nn.AdaptiveAvgPool2d((1, 1))
                self.fc = nn.Linear(8, 4)

            def forward(self, x):
                x = self.pool(self.act(self.conv(x)))
                x = x.view(x.shape[0], -1)
                return self.fc(x)

        model = Tiny().eval()
        dummy = torch.randn(*dummy_shape)
        torch.onnx.export(
            model,
            dummy,
            onnx_path,
            input_names=["images"],
            output_names=["logits"],
            opset_version=12,
            dynamic_axes={"images": {0: "N"}, "logits": {0: "N"}},
        )
        downgrade_ir(onnx_path)
    except Exception:
        used = "programmatic"
        from onnx import helper, TensorProto

        N, C, H, W = dummy_shape
        X = helper.make_tensor_value_info("images", TensorProto.FLOAT, [None, 3, H, W])
        # Conv -> Relu -> GlobalAvgPool -> Reshape -> MatMul -> Add
        Wt = np.random.randn(8, 3, 3, 3).astype(np.float32)
        B = np.zeros((8,), dtype=np.float32)
        conv_w = helper.make_tensor(
            "conv_W", TensorProto.FLOAT, Wt.shape, Wt.tobytes(), raw=True
        )
        conv_b = helper.make_tensor(
            "conv_B", TensorProto.FLOAT, B.shape, B.tobytes(), raw=True
        )
        conv = helper.make_node(
            "Conv", ["images", "conv_W", "conv_B"], ["c1"], pads=[1, 1, 1, 1]
        )
        relu = helper.make_node("Relu", ["c1"], ["r1"])
        gap = helper.make_node("GlobalAveragePool", ["r1"], ["p1"])
        shape = helper.make_tensor(
            "shape1", TensorProto.INT64, [2], np.array([1, 8], dtype=np.int64)
        )
        reshape = helper.make_node("Reshape", ["p1", "shape1"], ["flat"])
        W2 = np.random.randn(8, 4).astype(np.float32)
        b2 = np.zeros((4,), dtype=np.float32)
        W2t = helper.make_tensor(
            "W2", TensorProto.FLOAT, W2.shape, W2.tobytes(), raw=True
        )
        b2t = helper.make_tensor(
            "b2", TensorProto.FLOAT, b2.shape, b2.tobytes(), raw=True
        )
        matmul = helper.make_node("MatMul", ["flat", "W2"], ["m1"])
        add = helper.make_node("Add", ["m1", "b2"], ["logits"])
        graph = helper.make_graph(
            [conv, relu, gap, reshape, matmul, add],
            "tiny_graph",
            [X],
            [helper.make_tensor_value_info("logits", TensorProto.FLOAT, [None, 4])],
            [conv_w, conv_b, shape, W2t, b2t],
        )
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 12)])
        if getattr(model, "ir_version", 0) > 8:
            model.ir_version = 8
        onnx.save(model, onnx_path)

    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    x = np.random.randn(*dummy_shape).astype(np.float32)
    # Warmup
    for _ in range(5):
        sess.run(None, {"images": x})
    t0 = time.perf_counter()
    for _ in range(iters):
        sess.run(None, {"images": x})
    t1 = time.perf_counter()
    avg_ms = (t1 - t0) / iters * 1000.0
    size_mb = os.path.getsize(onnx_path) / 1e6

    meta = {
        "target": "ONNX",
        "status": "ok",
        "opset": 12,
        "input_shape": dummy_shape,
        "avg_latency_ms": round(avg_ms, 2),
        "file": onnx_path,
        "size_mb": round(size_mb, 2),
        "exporter": used,
    }
    if lines is not None:
        log_line = (
            "Target: ONNX | opset=12 | "
            f"input={dummy_shape} | exporter={used} | "
            f"file={onnx_path} ({size_mb:.2f} MB) | avg_latency={avg_ms:.2f} ms"
        )
        log_and_capture(lines, log_line)
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--targets",
        default="onnx",
        help="comma list: onnx,tflite,coreml,ncnn (only onnx implemented; others are stubbed)",
    )
    ap.add_argument("--image-size", type=int, default=320)
    ap.add_argument("--iters", type=int, default=25)
    ap.add_argument("--report", default=REPORT_PATH_DEFAULT)
    args = ap.parse_args()

    H = W = args.image_size
    dummy = (1, 3, H, W)
    lines = []
    ensure_dir(args.report)

    hdr_lines = [
        "# Edge Export Report",
        f"Generated: {datetime.datetime.utcnow().isoformat()}Z",
        f"Host: {platform.platform()} Py{platform.python_version()}",
        "",
    ]
    lines.append("\n".join(hdr_lines).strip())

    results = []
    targets = [t.strip().lower() for t in args.targets.split(",") if t.strip()]
    if "onnx" in targets:
        results.append(export_onnx(dummy, args.iters, lines))
    for t in ("tflite", "coreml", "ncnn"):
        if t in targets:
            s = {
                "target": t,
                "status": "skipped",
                "reason": "not implemented in CI dry-run",
            }
            results.append(s)
            log_and_capture(lines, f"Target: {t.upper()} | SKIPPED (dry-run)")

    json_block = "\n".join(
        [
            "",
            "## JSON",
            "```json",
            json.dumps(results, indent=2),
            "```",
            "",
        ]
    )
    lines.append(json_block)
    with open(args.report, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"Wrote {args.report}")


if __name__ == "__main__":
    main()
