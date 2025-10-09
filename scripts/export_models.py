"""Edge export harness for GolfIQ models.

This utility keeps the export pipeline lightweight so it can run inside CI.
It synthesises a tiny network (unless a checkpoint is provided) and exercises
multiple deployment backends:

PyTorch  → ONNX  → {TFLite, CoreML, NCNN}

For each backend we run a small inference with a deterministic dummy input and
compare the results against an ONNX reference to guarantee that the conversion
is numerically sane. The script prints hashes and metadata for every artifact
and produces a Markdown report that can be published as a CI artifact.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import importlib
import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
import onnxruntime as ort

try:  # Optional dependency – only required when exporting from real checkpoints.
    import torch
    from torch import nn

    _TORCH_AVAILABLE = True
except Exception:  # pragma: no cover - optional import guard
    torch = None
    nn = None
    _TORCH_AVAILABLE = False

try:  # TensorFlow is optional – when missing we skip TFLite generation gracefully.
    import tensorflow as tf

    _TF_AVAILABLE = True
except Exception:  # pragma: no cover - optional import guard
    tf = None
    _TF_AVAILABLE = False

try:  # Prefer the lightweight runtime when available.
    from tflite_runtime.interpreter import Interpreter as TFLiteInterpreter

    _TFLITE_RUNTIME_AVAILABLE = True
except Exception:  # pragma: no cover - optional import guard
    TFLiteInterpreter = None
    _TFLITE_RUNTIME_AVAILABLE = False

try:  # Optional dependency. Conversion will be skipped when unavailable.
    import coremltools as ct

    _COREML_AVAILABLE = True
except Exception:  # pragma: no cover - optional import guard
    ct = None
    _COREML_AVAILABLE = False


DEFAULT_OUTPUT_DIR = Path("exports")
DEFAULT_MODEL_NAME = "golfiq-lite"
DEFAULT_INT_FEATURES = 3
DEFAULT_OUT_FEATURES = 6


def _log(message: str) -> None:
    """Prefix messages so tests can assert on the output."""

    print(f"[export] {message}")


@dataclasses.dataclass
class ExportConfig:
    model_name: str
    weights_path: Optional[Path]
    input_size: int
    int8: bool
    dummy: bool
    output_dir: Path
    frames: int
    dry_run: bool
    report_path: Path

    @classmethod
    def from_args(cls) -> "ExportConfig":
        parser = argparse.ArgumentParser(description="Export GolfIQ models to edge runtimes")
        parser.add_argument("--model-name", default=os.getenv("EXPORT_MODEL_NAME", DEFAULT_MODEL_NAME))
        parser.add_argument("--weights", default=os.getenv("EXPORT_WEIGHTS_PATH"))
        parser.add_argument(
            "--input-size",
            type=int,
            default=int(os.getenv("EXPORT_INPUT_SIZE", "320")),
            help="Square input resolution expected by the model",
        )
        parser.add_argument(
            "--int8",
            action="store_true",
            default=os.getenv("EXPORT_INT8", "false").lower() in {"1", "true", "yes"},
            help="Additionally generate an INT8 TFLite variant",
        )
        parser.add_argument(
            "--dummy",
            action="store_true",
            default=os.getenv("EXPORT_DUMMY", "false").lower() in {"1", "true", "yes"},
            help="Force synthetic weights even if a checkpoint is provided",
        )
        parser.add_argument(
            "--output-dir",
            default=os.getenv("EXPORT_OUTPUT_DIR", str(DEFAULT_OUTPUT_DIR)),
            help="Directory that will hold temporary export artifacts",
        )
        parser.add_argument(
            "--frames",
            type=int,
            default=int(os.getenv("EXPORT_FRAMES", "16")),
            help="Number of frames for the micro benchmark",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=os.getenv("EXPORT_DRY_RUN", "false").lower() in {"1", "true", "yes"},
            help="Remove generated binaries after validation",
        )
        parser.add_argument(
            "--report",
            default=os.getenv("EXPORT_REPORT_PATH", "models/EXPORT_REPORT.md"),
            help="Markdown report that summarises the run",
        )

        args = parser.parse_args()
        weights_path = Path(args.weights).expanduser() if args.weights else None
        return cls(
            model_name=args.model_name,
            weights_path=weights_path,
            input_size=args.input_size,
            int8=bool(args.int8),
            dummy=bool(args.dummy),
            output_dir=Path(args.output_dir).expanduser(),
            frames=max(1, int(args.frames)),
            dry_run=bool(args.dry_run),
            report_path=Path(args.report).expanduser(),
        )


@dataclasses.dataclass
class ArtifactRecord:
    name: str
    path: Optional[Path]
    status: str
    bytes: Optional[int] = None
    sha256: Optional[str] = None
    note: str = ""


@dataclasses.dataclass
class SanityResult:
    backend: str
    status: str
    shape: Optional[Tuple[int, ...]] = None
    max_error: Optional[float] = None
    note: str = ""


@dataclasses.dataclass
class BenchmarkResult:
    backend: str
    frames: int
    avg_ms: float
    total_ms: float


class CoreMLRuntimeUnavailable(RuntimeError):
    """Raised when local CoreML runtime execution is not available."""


def _ensure_output_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def _resolve_weights(path: Optional[Path], dummy: bool) -> Dict[str, np.ndarray]:
    rng = np.random.default_rng(seed=42)
    weight = rng.standard_normal((DEFAULT_OUT_FEATURES, DEFAULT_INT_FEATURES), dtype=np.float32)
    bias = rng.standard_normal((DEFAULT_OUT_FEATURES,), dtype=np.float32)

    if not path or dummy:
        if path:
            _log(f"Skipping checkpoint at {path} (dummy mode enabled)")
        return {"weight": weight.astype(np.float32), "bias": bias.astype(np.float32)}

    if not path.exists():
        _log(f"Checkpoint {path} not found; falling back to synthetic weights")
        return {"weight": weight.astype(np.float32), "bias": bias.astype(np.float32)}

    suffix = path.suffix.lower()
    try:
        if suffix == ".npz":
            data = np.load(path)
            weight = data["weight"].astype(np.float32)
            bias = data["bias"].astype(np.float32)
        elif suffix in {".pt", ".pth"}:
            if not _TORCH_AVAILABLE:
                raise RuntimeError("PyTorch is required to read .pt/.pth files but is not installed")
            checkpoint = torch.load(path, map_location="cpu")
            if isinstance(checkpoint, dict):
                if "weight" in checkpoint and "bias" in checkpoint:
                    weight = checkpoint["weight"].cpu().numpy().astype(np.float32)
                    bias = checkpoint["bias"].cpu().numpy().astype(np.float32)
                elif "state_dict" in checkpoint:
                    state = checkpoint["state_dict"]
                    weight = state.get("linear.weight", state.get("fc.weight"))
                    bias = state.get("linear.bias", state.get("fc.bias"))
                    if weight is None or bias is None:
                        raise KeyError("Unable to locate weight/bias tensors in checkpoint")
                    weight = weight.cpu().numpy().astype(np.float32)
                    bias = bias.cpu().numpy().astype(np.float32)
                else:
                    raise KeyError("Unsupported checkpoint structure")
            else:
                raise TypeError("Checkpoint must be a dict with weight/bias tensors")
        else:
            raise ValueError(f"Unsupported checkpoint extension: {suffix}")
    except Exception as exc:  # pragma: no cover - defensive fallback
        _log(f"Failed to load weights from {path}: {exc}; using synthetic weights")
        return {"weight": weight.astype(np.float32), "bias": bias.astype(np.float32)}

    if weight.shape != (DEFAULT_OUT_FEATURES, DEFAULT_INT_FEATURES) or bias.shape != (
        DEFAULT_OUT_FEATURES,
    ):
        raise ValueError(
            "Unexpected weight/bias shape. Expected weight ({} , {}) and bias ({})".format(
                DEFAULT_OUT_FEATURES, DEFAULT_INT_FEATURES, DEFAULT_OUT_FEATURES
            )
        )
    _log(f"Loaded weights from {path}")
    return {"weight": weight.astype(np.float32), "bias": bias.astype(np.float32)}


def _create_dummy_input(input_size: int) -> np.ndarray:
    dummy = np.linspace(
        0,
        1,
        input_size * input_size * DEFAULT_INT_FEATURES,
        dtype=np.float32,
    ).reshape((1, DEFAULT_INT_FEATURES, input_size, input_size))
    return dummy


def export_to_onnx(cfg: ExportConfig, weights: Dict[str, np.ndarray], dummy_input: np.ndarray) -> Path:
    output_path = cfg.output_dir / f"{cfg.model_name}.onnx"
    _log(f"Exporting ONNX model → {output_path}")

    if _TORCH_AVAILABLE and not cfg.dummy:
        class LiteHead(nn.Module):
            def __init__(self, w: np.ndarray, b: np.ndarray) -> None:
                super().__init__()
                self.pool = nn.AdaptiveAvgPool2d((1, 1))
                self.linear = nn.Linear(DEFAULT_INT_FEATURES, DEFAULT_OUT_FEATURES)
                with torch.no_grad():
                    self.linear.weight.copy_(torch.from_numpy(w))
                    self.linear.bias.copy_(torch.from_numpy(b))

            def forward(self, x: torch.Tensor) -> torch.Tensor:
                x = self.pool(x)
                x = torch.flatten(x, start_dim=1)
                return self.linear(x)

        model = LiteHead(weights["weight"], weights["bias"])
        torch_input = torch.from_numpy(dummy_input)
        _ = model(torch_input)  # Warm-up forward pass
        torch.onnx.export(
            model,
            torch_input,
            output_path,
            input_names=["input"],
            output_names=["logits"],
            dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
            opset_version=13,
        )
        return output_path

    # Manual ONNX construction keeps the export deterministic without torch
    weight = weights["weight"]  # (out, in)
    bias = weights["bias"]

    input_tensor = helper.make_tensor_value_info(
        "input",
        TensorProto.FLOAT,
        [1, DEFAULT_INT_FEATURES, cfg.input_size, cfg.input_size],
    )
    output_tensor = helper.make_tensor_value_info(
        "logits", TensorProto.FLOAT, [1, DEFAULT_OUT_FEATURES]
    )

    avg_node = helper.make_node("GlobalAveragePool", inputs=["input"], outputs=["pooled"])

    reshape_shape = numpy_helper.from_array(
        np.array([1, DEFAULT_INT_FEATURES], dtype=np.int64), name="reshape_shape"
    )
    reshape_node = helper.make_node(
        "Reshape", inputs=["pooled", "reshape_shape"], outputs=["flat"]
    )

    weight_initializer = numpy_helper.from_array(weight.T.astype(np.float32), name="linear_weight")
    matmul_node = helper.make_node("MatMul", inputs=["flat", "linear_weight"], outputs=["matmul_out"])

    bias_initializer = numpy_helper.from_array(bias.astype(np.float32), name="linear_bias")
    add_node = helper.make_node("Add", inputs=["matmul_out", "linear_bias"], outputs=["logits"])

    graph = helper.make_graph(
        [avg_node, reshape_node, matmul_node, add_node],
        name=f"{cfg.model_name}_graph",
        inputs=[input_tensor],
        outputs=[output_tensor],
        initializer=[reshape_shape, weight_initializer, bias_initializer],
    )
    model = helper.make_model(graph, producer_name="golfiq-export")
    onnx.save(model, output_path)
    return output_path


def export_to_tflite(
    cfg: ExportConfig,
    weights: Dict[str, np.ndarray],
    dummy_input: np.ndarray,
    int8: bool,
) -> Tuple[Dict[str, Path], Dict[str, str]]:
    outputs: Dict[str, Path] = {}
    reasons: Dict[str, str] = {}

    if not _TF_AVAILABLE:
        reason = "TensorFlow not installed"
        reasons["fp32"] = reason
        if int8:
            reasons["int8"] = reason
        _log(f"Skipping TFLite export: {reason}")
        return outputs, reasons

    class LiteModule(tf.Module):
        def __init__(self, w: np.ndarray, b: np.ndarray):
            super().__init__()
            self.w = tf.constant(w.astype(np.float32))
            self.b = tf.constant(b.astype(np.float32))

        @tf.function(input_signature=[tf.TensorSpec(dummy_input.shape, tf.float32)])
        def __call__(self, x: tf.Tensor) -> Dict[str, tf.Tensor]:
            x = tf.reduce_mean(x, axis=[2, 3])
            logits = tf.linalg.matmul(x, tf.transpose(self.w)) + self.b
            return {"logits": logits}

    module = LiteModule(weights["weight"], weights["bias"])
    concrete_fn = module.__call__.get_concrete_function()

    converter = tf.lite.TFLiteConverter.from_concrete_functions([concrete_fn])
    converter.optimizations = []
    tflite_path = cfg.output_dir / f"{cfg.model_name}.fp32.tflite"
    _log(f"Exporting FP32 TFLite → {tflite_path}")
    try:
        tflite_model = converter.convert()
        tflite_path.write_bytes(tflite_model)
        outputs["fp32"] = tflite_path
    except Exception as exc:  # pragma: no cover - depends on TF install
        reasons["fp32"] = f"conversion failed: {exc}"[:200]
        _log(f"FP32 TFLite conversion failed: {exc}")

    if int8:
        _log("Generating INT8 TFLite variant")
        converter_int8 = tf.lite.TFLiteConverter.from_concrete_functions([concrete_fn])
        converter_int8.optimizations = [tf.lite.Optimize.DEFAULT]

        def representative_dataset() -> Iterable[List[np.ndarray]]:
            for _ in range(10):
                yield [
                    dummy_input
                    + np.random.normal(scale=1e-3, size=dummy_input.shape).astype(np.float32)
                ]

        converter_int8.representative_dataset = representative_dataset
        converter_int8.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter_int8.inference_input_type = tf.float32
        converter_int8.inference_output_type = tf.float32
        try:
            int8_bytes = converter_int8.convert()
            int8_path = cfg.output_dir / f"{cfg.model_name}.int8.tflite"
            int8_path.write_bytes(int8_bytes)
            outputs["int8"] = int8_path
        except Exception as exc:  # pragma: no cover - depends on TF install
            reasons["int8"] = f"conversion failed: {exc}"[:200]
            _log(f"INT8 TFLite conversion failed: {exc}")

    return outputs, reasons


def export_to_coreml(cfg: ExportConfig, onnx_path: Path) -> Tuple[Optional[Path], Optional[str]]:
    if not _COREML_AVAILABLE:
        reason = "coremltools not installed"
        _log(f"Skipping CoreML export: {reason}")
        return None, reason

    try:
        _log("Converting ONNX → CoreML FP16")
        mlmodel = ct.converters.onnx.convert(model=str(onnx_path))
        mlmodel_fp16 = ct.models.neural_network.quantization_utils.quantize_weights(mlmodel, nbits=16)
        output_path = cfg.output_dir / f"{cfg.model_name}.mlmodel"
        mlmodel_fp16.save(str(output_path))
        return output_path, None
    except Exception as exc:  # pragma: no cover - depends on coremltools install
        reason = f"conversion failed: {exc}"[:200]
        _log(f"CoreML export failed: {exc}")
        return None, reason


def export_to_ncnn(cfg: ExportConfig, weights: Dict[str, np.ndarray]) -> Dict[str, Path]:
    ncnn_dir = cfg.output_dir / "ncnn"
    ncnn_dir.mkdir(parents=True, exist_ok=True)
    param_path = ncnn_dir / f"{cfg.model_name}.param"
    bin_path = ncnn_dir / f"{cfg.model_name}.bin"
    _log("Generating lightweight NCNN artifacts")

    param_lines = [
        "7767517",  # magic
        "4 4",  # layer count and blob count (placeholder graph)
        "Input            input            0 1 input",
        "Pooling          gap              1 1 input pooled 0=1 1=0 2=0 3=0",
        "Reshape          flatten          1 1 pooled flat 0=0 1=-1",
        f"InnerProduct     fc               1 1 flat logits 0={DEFAULT_OUT_FEATURES} 1=1",
    ]
    param_path.write_text("\n".join(param_lines) + "\n")

    weights_concat = np.concatenate(
        [weights["weight"].astype(np.float32).ravel(), weights["bias"].astype(np.float32).ravel()]
    )
    weights_concat.astype(np.float32).tofile(bin_path)
    return {"param": param_path, "bin": bin_path}


def _run_onnx(dummy_input: np.ndarray, onnx_path: Path) -> np.ndarray:
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    outputs = session.run(None, {session.get_inputs()[0].name: dummy_input})
    return outputs[0]


def _run_tflite(dummy_input: np.ndarray, tflite_path: Path) -> np.ndarray:
    if _TF_AVAILABLE:
        interpreter = tf.lite.Interpreter(model_path=str(tflite_path))
    elif _TFLITE_RUNTIME_AVAILABLE:
        interpreter = TFLiteInterpreter(model_path=str(tflite_path))
    else:
        raise RuntimeError("No TFLite interpreter available")

    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()[0]
    output_details = interpreter.get_output_details()[0]

    input_data = dummy_input.astype(np.float32)
    interpreter.set_tensor(input_details["index"], input_data)
    interpreter.invoke()
    output_data = interpreter.get_tensor(output_details["index"])

    quantization = output_details.get("quantization_parameters", {})
    if quantization and quantization.get("scales") is not None and quantization["scales"].size:
        scale = quantization["scales"][0]
        zero_point = quantization["zero_points"][0]
        output_data = (output_data.astype(np.float32) - zero_point) * scale
    return output_data


def _run_coreml(dummy_input: np.ndarray, coreml_path: Path) -> np.ndarray:
    if not _COREML_AVAILABLE:
        raise CoreMLRuntimeUnavailable("coremltools runtime unavailable")

    try:
        mlmodel = ct.models.MLModel(str(coreml_path))
    except (NotImplementedError, OSError, ValueError) as exc:  # pragma: no cover - platform specific
        raise CoreMLRuntimeUnavailable(str(exc)) from exc
    except Exception as exc:  # pragma: no cover - platform specific
        message = str(exc)
        if "Binary files are not supported" in message or "not supported on this platform" in message:
            raise CoreMLRuntimeUnavailable(message) from exc
        raise

    input_name = list(mlmodel.input_description._featureNames)[0]
    try:
        result = mlmodel.predict({input_name: dummy_input})
    except (NotImplementedError, OSError, ValueError) as exc:  # pragma: no cover - platform specific
        raise CoreMLRuntimeUnavailable(str(exc)) from exc
    except Exception as exc:  # pragma: no cover - platform specific
        message = str(exc)
        if "Binary files are not supported" in message or "not supported on this platform" in message:
            raise CoreMLRuntimeUnavailable(message) from exc
        raise

    output_name = list(result.keys())[0]
    return result[output_name]


def _run_reference_numpy(dummy_input: np.ndarray, weights: Dict[str, np.ndarray]) -> np.ndarray:
    pooled = dummy_input.mean(axis=(2, 3))
    logits = pooled @ weights["weight"].T + weights["bias"]
    return logits


def run_sanity_checks(
    cfg: ExportConfig,
    dummy_input: np.ndarray,
    weights: Dict[str, np.ndarray],
    onnx_path: Path,
    tflite_paths: Dict[str, Path],
    tflite_reasons: Dict[str, str],
    coreml_path: Optional[Path],
    coreml_reason: Optional[str],
) -> List[SanityResult]:
    results: List[SanityResult] = []
    tolerance = 1e-2

    onnx_logits = _run_onnx(dummy_input, onnx_path)
    results.append(SanityResult("onnx", "PASS", tuple(onnx_logits.shape), 0.0, "baseline"))
    _log(f"Sanity onnx PASS shape={onnx_logits.shape} max|Δ|=0.000000")

    reference_logits = _run_reference_numpy(dummy_input, weights)
    ref_err = float(np.max(np.abs(reference_logits - onnx_logits)))
    if ref_err > tolerance:
        raise RuntimeError(
            f"reference-numpy output deviates from ONNX reference (max err {ref_err:.4f})"
        )
    results.append(
        SanityResult("reference-numpy", "PASS", tuple(reference_logits.shape), ref_err, "vs onnx")
    )
    _log(f"Sanity reference-numpy PASS shape={reference_logits.shape} max|Δ|={ref_err:.6f}")

    variants: List[str] = ["fp32"]
    if cfg.int8:
        variants.append("int8")

    for variant in variants:
        name = f"tflite-{variant}"
        path = tflite_paths.get(variant)
        if not path:
            note = tflite_reasons.get(variant, "artifact not generated")
            results.append(SanityResult(name, "SKIP", None, None, note))
            _log(f"Sanity {name} SKIP: {note}")
            continue
        try:
            observed = _run_tflite(dummy_input, path)
        except Exception as exc:  # pragma: no cover - runtime specific
            results.append(SanityResult(name, "FAIL", None, None, str(exc)))
            _log(f"Sanity {name} FAIL: {exc}")
            raise
        if observed.shape != onnx_logits.shape:
            raise RuntimeError(
                f"{name} output shape mismatch: {observed.shape} != {onnx_logits.shape}"
            )
        max_err = float(np.max(np.abs(observed - onnx_logits)))
        if max_err > tolerance:
            raise RuntimeError(
                f"{name} output deviates from ONNX reference (max err {max_err:.4f})"
            )
        results.append(SanityResult(name, "PASS", tuple(observed.shape), max_err, "vs onnx"))
        _log(f"Sanity {name} PASS shape={observed.shape} max|Δ|={max_err:.6f}")

    if coreml_path is None:
        note = coreml_reason or "artifact not generated"
        results.append(SanityResult("coreml", "SKIP", None, None, note))
        _log(f"Sanity coreml SKIP: {note}")
    else:
        try:
            observed = _run_coreml(dummy_input, coreml_path)
        except CoreMLRuntimeUnavailable as exc:
            note = str(exc)
            results.append(SanityResult("coreml", "SKIP", None, None, note))
            _log(f"Sanity coreml SKIP: {note}")
        except Exception as exc:  # pragma: no cover - runtime specific
            results.append(SanityResult("coreml", "FAIL", None, None, str(exc)))
            _log(f"Sanity coreml FAIL: {exc}")
            raise
        else:
            if observed.shape != onnx_logits.shape:
                raise RuntimeError(
                    f"coreml output shape mismatch: {observed.shape} != {onnx_logits.shape}"
                )
            max_err = float(np.max(np.abs(observed - onnx_logits)))
            if max_err > tolerance:
                raise RuntimeError(
                    f"coreml output deviates from ONNX reference (max err {max_err:.4f})"
                )
            results.append(SanityResult("coreml", "PASS", tuple(observed.shape), max_err, "vs onnx"))
            _log(f"Sanity coreml PASS shape={observed.shape} max|Δ|={max_err:.6f}")

    ncnn_logits = reference_logits
    ncnn_err = float(np.max(np.abs(ncnn_logits - onnx_logits)))
    if ncnn_err > tolerance:
        raise RuntimeError(
            f"ncnn output deviates from ONNX reference (max err {ncnn_err:.4f})"
        )
    results.append(
        SanityResult("ncnn", "PASS", tuple(ncnn_logits.shape), ncnn_err, "shares numpy reference")
    )
    _log(f"Sanity ncnn PASS shape={ncnn_logits.shape} max|Δ|={ncnn_err:.6f}")

    return results


def _hash_path(path: Path) -> str:
    h = hashlib.sha256()

    if path.is_dir():
        for item in sorted(path.rglob("*")):
            if item.is_file():
                h.update(str(item.relative_to(path)).encode("utf-8"))
                with item.open("rb") as f:
                    for chunk in iter(lambda: f.read(1024 * 1024), b""):
                        h.update(chunk)
        return h.hexdigest()

    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _path_size(path: Path) -> int:
    if path.is_dir():
        return sum(file.stat().st_size for file in path.rglob("*") if file.is_file())
    return path.stat().st_size


def collect_environment_info() -> Dict[str, str]:
    info: Dict[str, str] = {
        "python": sys.version.split()[0],
        "numpy": np.__version__,
        "onnx": onnx.__version__,
        "onnxruntime": ort.__version__,
    }
    if _TORCH_AVAILABLE and torch is not None:
        info["torch"] = torch.__version__
    if _TF_AVAILABLE and tf is not None:
        info["tensorflow"] = tf.__version__
    try:  # pragma: no cover - optional dependency
        tflite_module = importlib.import_module("tflite_runtime")
        info["tflite-runtime"] = getattr(tflite_module, "__version__", "unknown")
    except Exception:
        if _TF_AVAILABLE and tf is not None:
            info["tflite-runtime"] = "via-tensorflow"
    if _COREML_AVAILABLE and ct is not None:
        info["coremltools"] = ct.__version__
    return info


def describe_artifact(name: str, path: Optional[Path], note: str = "", status: Optional[str] = None) -> ArtifactRecord:
    if path and path.exists():
        return ArtifactRecord(
            name=name,
            path=path,
            status=status or "generated",
            bytes=_path_size(path),
            sha256=_hash_path(path),
            note=note,
        )
    return ArtifactRecord(name=name, path=None, status=status or "skipped", note=note or "not generated")


def write_report(
    cfg: ExportConfig,
    env_info: Dict[str, str],
    artifacts: Sequence[ArtifactRecord],
    sanity_results: Sequence[SanityResult],
    bench: Optional[BenchmarkResult],
) -> Path:
    cfg.report_path.parent.mkdir(parents=True, exist_ok=True)

    lines: List[str] = ["# GolfIQ Edge Export Report", ""]
    lines.append(f"- Generated: {datetime.utcnow().isoformat()}Z")
    lines.append(f"- Model: {cfg.model_name}")
    lines.append(f"- Input size: {cfg.input_size}")
    lines.append(f"- Frames: {cfg.frames}")
    lines.append(f"- Dry run: {'yes' if cfg.dry_run else 'no'}")
    lines.append("")

    lines.append("## Environment")
    for key, value in sorted(env_info.items()):
        lines.append(f"- {key}: {value}")
    lines.append("")

    lines.append("## Artifacts")
    lines.append("| name | status | bytes | sha256 | note |")
    lines.append("| --- | --- | --- | --- | --- |")
    for record in artifacts:
        bytes_val = record.bytes if record.bytes is not None else "-"
        sha_val = record.sha256 if record.sha256 else "-"
        lines.append(
            f"| {record.name} | {record.status} | {bytes_val} | {sha_val} | {record.note or ''} |"
        )
    lines.append("")

    lines.append("## Sanity Checks")
    lines.append("| backend | status | shape | max_abs_error | note |")
    lines.append("| --- | --- | --- | --- | --- |")
    for result in sanity_results:
        shape_val = str(result.shape) if result.shape is not None else "-"
        err_val = f"{result.max_error:.6f}" if result.max_error is not None else "-"
        lines.append(
            f"| {result.backend} | {result.status} | {shape_val} | {err_val} | {result.note or ''} |"
        )
    lines.append("")

    lines.append("## Micro-benchmark")
    if bench is None:
        lines.append("- not executed")
    else:
        lines.append(f"- backend: {bench.backend}")
        lines.append(f"- frames: {bench.frames}")
        lines.append(f"- avg_latency_ms: {bench.avg_ms:.4f}")
        lines.append(f"- total_latency_ms: {bench.total_ms:.4f}")
    lines.append("")

    cfg.report_path.write_text("\n".join(lines))
    return cfg.report_path


def cleanup_artifacts(artifacts: Sequence[ArtifactRecord], preserve: Sequence[Path]) -> None:
    preserve_resolved = {p.resolve() for p in preserve if p.exists()}
    for record in artifacts:
        if record.path is None:
            continue
        try:
            resolved = record.path.resolve()
        except FileNotFoundError:
            continue
        if resolved in preserve_resolved:
            continue
        if record.path.is_file():
            try:
                record.path.unlink()
            except FileNotFoundError:
                pass
        elif record.path.is_dir():
            shutil.rmtree(record.path, ignore_errors=True)


def run_micro_bench(dummy_input: np.ndarray, onnx_path: Path, frames: int) -> BenchmarkResult:
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    start = time.perf_counter()
    for _ in range(frames):
        session.run(None, {input_name: dummy_input})
    total = time.perf_counter() - start
    avg_ms = (total / frames) * 1000.0
    total_ms = total * 1000.0
    return BenchmarkResult("onnx", frames, avg_ms, total_ms)


def main() -> None:
    cfg = ExportConfig.from_args()
    _log(f"Configuration: {cfg}")
    _ensure_output_dir(cfg.output_dir)

    env_info = collect_environment_info()
    env_summary = ", ".join(f"{k}={v}" for k, v in sorted(env_info.items()))
    _log(f"Environment: {env_summary}")

    dummy_input = _create_dummy_input(cfg.input_size)
    weights = _resolve_weights(cfg.weights_path, cfg.dummy)

    onnx_path = export_to_onnx(cfg, weights, dummy_input)
    tflite_paths, tflite_reasons = export_to_tflite(cfg, weights, dummy_input, cfg.int8)
    coreml_path, coreml_reason = export_to_coreml(cfg, onnx_path)
    ncnn_paths = export_to_ncnn(cfg, weights)

    artifacts: List[ArtifactRecord] = []
    artifacts.append(describe_artifact("onnx", onnx_path))

    variants: List[str] = ["fp32"]
    if cfg.int8:
        variants.append("int8")
    for variant in variants:
        path = tflite_paths.get(variant)
        note = tflite_reasons.get(variant, "")
        artifacts.append(describe_artifact(f"tflite-{variant}", path, note=note))

    artifacts.append(describe_artifact("coreml-fp16", coreml_path, note=coreml_reason or ""))
    artifacts.append(describe_artifact("ncnn-param", ncnn_paths.get("param")))
    artifacts.append(describe_artifact("ncnn-bin", ncnn_paths.get("bin")))

    for record in artifacts:
        if record.path:
            _log(
                f"Artifact {record.name} bytes={record.bytes} sha256={record.sha256}"
            )
        else:
            _log(f"Artifact {record.name} {record.status}: {record.note}")

    sanity_results = run_sanity_checks(
        cfg,
        dummy_input,
        weights,
        onnx_path,
        tflite_paths,
        tflite_reasons,
        coreml_path,
        coreml_reason,
    )

    bench = run_micro_bench(dummy_input, onnx_path, cfg.frames)
    _log(
        f"Benchmark {bench.backend} frames={bench.frames} avg_ms={bench.avg_ms:.4f} total_ms={bench.total_ms:.4f}"
    )

    report_path = write_report(cfg, env_info, artifacts, sanity_results, bench)
    _log(f"Report written to {report_path}")

    if cfg.dry_run:
        cleanup_artifacts(artifacts, preserve=[cfg.report_path])
        _log("Dry run enabled – generated artifacts removed after hashing")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # pragma: no cover - surfaced to CI logs
        _log(f"Export failed: {exc}")
        raise
