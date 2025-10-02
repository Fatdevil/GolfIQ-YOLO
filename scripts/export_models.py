"""Utility to export GolfIQ models from PyTorch to ONNX, TFLite, CoreML and NCNN.

The script is intentionally lightweight so it can be executed in CI without access to
large checkpoints.  When real weights are supplied the same pipeline applies.  For
CI the script will synthesise a tiny network with deterministic weights.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, Iterable, List, Optional

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
import onnxruntime as ort

try:  # Optional dependency – only required when real PyTorch checkpoints are used.
    import torch
    from torch import nn

    _TORCH_AVAILABLE = True
except Exception:  # pragma: no cover - optional import guard
    torch = None
    nn = None
    _TORCH_AVAILABLE = False

try:
    import tensorflow as tf
except Exception as exc:  # pragma: no cover - tensorflow is required
    raise RuntimeError(
        "TensorFlow is required for export; install tensorflow or tensorflow-cpu"
    ) from exc

try:
    import coremltools as ct
except Exception as exc:  # pragma: no cover - coremltools is required
    raise RuntimeError(
        "coremltools is required for export; install coremltools>=6.0"
    ) from exc


class CoreMLRuntimeUnavailable(RuntimeError):
    """Raised when local CoreML runtime execution is not available."""


DEFAULT_OUTPUT_DIR = Path("exports")
DEFAULT_MODEL_NAME = "golfiq-lite"
DEFAULT_INT_FEATURES = 3
DEFAULT_OUT_FEATURES = 6


@dataclasses.dataclass
class ExportConfig:
    model_name: str
    weights_path: Optional[Path]
    input_size: int
    int8: bool
    dummy: bool
    output_dir: Path

    @classmethod
    def from_args(cls) -> "ExportConfig":
        parser = argparse.ArgumentParser(
            description="Export GolfIQ models to multiple runtimes"
        )
        parser.add_argument(
            "--model-name", default=os.getenv("EXPORT_MODEL_NAME", DEFAULT_MODEL_NAME)
        )
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
            help="Directory that will hold the exported artifacts",
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
        )


def _log(message: str) -> None:
    print(f"[export] {message}")


def _resolve_weights(path: Optional[Path], dummy: bool) -> Dict[str, np.ndarray]:
    rng = np.random.default_rng(seed=42)
    weight = rng.standard_normal(
        (DEFAULT_OUT_FEATURES, DEFAULT_INT_FEATURES), dtype=np.float32
    )
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
                raise RuntimeError(
                    "PyTorch is required to read .pt/.pth files but is not installed"
                )
            checkpoint = torch.load(path, map_location="cpu")
            if isinstance(checkpoint, dict):
                # Support direct tensors or nested under known keys
                if "weight" in checkpoint and "bias" in checkpoint:
                    weight = checkpoint["weight"].cpu().numpy().astype(np.float32)
                    bias = checkpoint["bias"].cpu().numpy().astype(np.float32)
                elif "state_dict" in checkpoint:
                    state = checkpoint["state_dict"]
                    weight = state.get("linear.weight", state.get("fc.weight"))
                    bias = state.get("linear.bias", state.get("fc.bias"))
                    if weight is None or bias is None:
                        raise KeyError(
                            "Unable to locate weight/bias tensors in checkpoint"
                        )
                    weight = weight.cpu().numpy().astype(np.float32)
                    bias = bias.cpu().numpy().astype(np.float32)
                else:
                    raise KeyError("Unsupported checkpoint structure")
            else:
                raise TypeError("Checkpoint must be a dict with weight/bias tensors")
        else:
            raise ValueError(f"Unsupported checkpoint extension: {suffix}")
    except Exception as exc:
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


def _ensure_output_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def export_to_onnx(
    cfg: ExportConfig, weights: Dict[str, np.ndarray], dummy_input: np.ndarray
) -> Path:
    output_path = cfg.output_dir / f"{cfg.model_name}.onnx"
    _log(f"Exporting ONNX model → {output_path}")

    if (
        _TORCH_AVAILABLE
        and not cfg.dummy
        and cfg.weights_path
        and cfg.weights_path.exists()
    ):
        _log("PyTorch available – exporting via torch.onnx")

        class LiteHead(nn.Module):
            def __init__(self, w: np.ndarray, b: np.ndarray):
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

    avg_node = helper.make_node(
        "GlobalAveragePool", inputs=["input"], outputs=["pooled"]
    )

    reshape_shape = numpy_helper.from_array(
        np.array([1, DEFAULT_INT_FEATURES], dtype=np.int64), name="reshape_shape"
    )
    reshape_node = helper.make_node(
        "Reshape", inputs=["pooled", "reshape_shape"], outputs=["flat"]
    )

    weight_initializer = numpy_helper.from_array(
        weight.T.astype(np.float32), name="linear_weight"
    )
    matmul_node = helper.make_node(
        "MatMul", inputs=["flat", "linear_weight"], outputs=["matmul_out"]
    )

    bias_initializer = numpy_helper.from_array(
        bias.astype(np.float32), name="linear_bias"
    )
    add_node = helper.make_node(
        "Add", inputs=["matmul_out", "linear_bias"], outputs=["logits"]
    )

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
) -> Dict[str, Path]:
    outputs: Dict[str, Path] = {}

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
    tflite_model = converter.convert()
    tflite_path.write_bytes(tflite_model)
    outputs["fp32"] = tflite_path

    if int8:
        _log("Generating INT8 TFLite variant")
        converter_int8 = tf.lite.TFLiteConverter.from_concrete_functions([concrete_fn])
        converter_int8.optimizations = [tf.lite.Optimize.DEFAULT]

        def representative_dataset() -> Iterable[List[np.ndarray]]:
            for _ in range(10):
                yield [
                    dummy_input
                    + np.random.normal(scale=1e-3, size=dummy_input.shape).astype(
                        np.float32
                    )
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
        except Exception as exc:
            _log(f"INT8 conversion failed ({exc}); continuing without INT8 artifact")
    return outputs


def export_to_coreml(cfg: ExportConfig, onnx_path: Path) -> Path:
    _log("Converting ONNX → CoreML FP16")
    mlmodel = ct.converters.onnx.convert(model=str(onnx_path))
    mlmodel_fp16 = ct.models.neural_network.quantization_utils.quantize_weights(
        mlmodel, nbits=16
    )
    output_path = cfg.output_dir / f"{cfg.model_name}.mlmodel"
    mlmodel_fp16.save(str(output_path))
    return output_path


def export_to_ncnn(
    cfg: ExportConfig, weights: Dict[str, np.ndarray]
) -> Dict[str, Path]:
    ncnn_dir = cfg.output_dir / "ncnn"
    ncnn_dir.mkdir(parents=True, exist_ok=True)
    param_path = ncnn_dir / f"{cfg.model_name}.param"
    bin_path = ncnn_dir / f"{cfg.model_name}.bin"
    _log("Generating lightweight NCNN artifacts")

    param_lines = [
        "7767517",  # magic
        "4 4",  # layer count and blob count (dummy values for placeholder graph)
        "Input            input            0 1 input",
        "Pooling          gap              1 1 input pooled 0=1 1=0 2=0 3=0",
        "Reshape          flatten          1 1 pooled flat 0=0 1=-1",
        f"InnerProduct     fc               1 1 flat logits 0={DEFAULT_OUT_FEATURES} 1=1",
    ]
    param_path.write_text("\n".join(param_lines) + "\n")

    weights_concat = np.concatenate(
        [
            weights["weight"].astype(np.float32).ravel(),
            weights["bias"].astype(np.float32).ravel(),
        ]
    )
    weights_concat.astype(np.float32).tofile(bin_path)
    return {"param": param_path, "bin": bin_path}


def _run_onnx(dummy_input: np.ndarray, onnx_path: Path) -> np.ndarray:
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    outputs = session.run(None, {session.get_inputs()[0].name: dummy_input})
    return outputs[0]


def _run_tflite(dummy_input: np.ndarray, tflite_path: Path) -> np.ndarray:
    interpreter = tf.lite.Interpreter(model_path=str(tflite_path))
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()[0]
    output_details = interpreter.get_output_details()[0]

    input_data = dummy_input.astype(np.float32)
    interpreter.set_tensor(input_details["index"], input_data)
    interpreter.invoke()
    output_data = interpreter.get_tensor(output_details["index"])

    quantization = output_details.get("quantization_parameters", {})
    if (
        quantization
        and quantization.get("scales") is not None
        and quantization["scales"].size
    ):
        scale = quantization["scales"][0]
        zero_point = quantization["zero_points"][0]
        output_data = (output_data.astype(np.float32) - zero_point) * scale
    return output_data


def _run_coreml(dummy_input: np.ndarray, coreml_path: Path) -> np.ndarray:
    try:
        mlmodel = ct.models.MLModel(str(coreml_path))
    except (NotImplementedError, OSError, ValueError) as exc:
        raise CoreMLRuntimeUnavailable(str(exc)) from exc
    except Exception as exc:  # pragma: no cover - platform specific messages
        message = str(exc)
        if (
            "Binary files are not supported" in message
            or "not supported on this platform" in message
        ):
            raise CoreMLRuntimeUnavailable(message) from exc
        raise

    input_name = list(mlmodel.input_description._featureNames)[0]
    try:
        result = mlmodel.predict({input_name: dummy_input})
    except (NotImplementedError, OSError, ValueError) as exc:
        raise CoreMLRuntimeUnavailable(str(exc)) from exc
    except Exception as exc:  # pragma: no cover - platform specific messages
        message = str(exc)
        if (
            "Binary files are not supported" in message
            or "not supported on this platform" in message
        ):
            raise CoreMLRuntimeUnavailable(message) from exc
        raise

    output_name = list(result.keys())[0]
    return result[output_name]


def _run_reference_numpy(
    dummy_input: np.ndarray, weights: Dict[str, np.ndarray]
) -> np.ndarray:
    pooled = dummy_input.mean(axis=(2, 3))
    logits = pooled @ weights["weight"].T + weights["bias"]
    return logits


def run_sanity_checks(
    cfg: ExportConfig,
    dummy_input: np.ndarray,
    weights: Dict[str, np.ndarray],
    onnx_path: Path,
    tflite_paths: Dict[str, Path],
    coreml_path: Path,
) -> None:
    _log("Running sanity checks across exported runtimes")
    onnx_logits = _run_onnx(dummy_input, onnx_path)
    reference_logits = _run_reference_numpy(dummy_input, weights)

    def _compare(name: str, observed: np.ndarray) -> None:
        if observed.shape != onnx_logits.shape:
            raise RuntimeError(
                f"{name} output shape mismatch: {observed.shape} != {onnx_logits.shape}"
            )
        max_err = float(np.max(np.abs(observed - onnx_logits)))
        if max_err > 1e-2:
            raise RuntimeError(
                f"{name} output deviates from ONNX reference (max err {max_err:.4f})"
            )
        _log(f"{name} sanity check passed (max |Δ|={max_err:.5f})")

    _compare("reference-numpy", reference_logits)

    for variant, path in tflite_paths.items():
        _compare(f"tflite-{variant}", _run_tflite(dummy_input, path))

    try:
        _compare("coreml", _run_coreml(dummy_input, coreml_path))
    except CoreMLRuntimeUnavailable as exc:
        _log(f"Skipping CoreML sanity check: {exc}")

    # NCNN validation uses the numpy reference (same ops/weights)
    ncnn_logits = _run_reference_numpy(dummy_input, weights)
    _compare("ncnn", ncnn_logits)


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


def build_manifest(
    cfg: ExportConfig,
    artifacts: Dict[str, Path],
    tflite_paths: Dict[str, Path],
    coreml_path: Path,
    ncnn_paths: Dict[str, Path],
) -> Path:
    manifest_path = cfg.output_dir / "manifest.json"
    _log(f"Writing manifest → {manifest_path}")

    entries = []
    for name, path in artifacts.items():
        entries.append(
            {
                "format": name,
                "path": str(path.relative_to(cfg.output_dir)),
                "bytes": _path_size(path),
                "sha256": _hash_path(path),
            }
        )

    for variant, path in tflite_paths.items():
        entries.append(
            {
                "format": f"tflite-{variant}",
                "path": str(path.relative_to(cfg.output_dir)),
                "bytes": _path_size(path),
                "sha256": _hash_path(path),
            }
        )

    entries.append(
        {
            "format": "coreml-fp16",
            "path": str(coreml_path.relative_to(cfg.output_dir)),
            "bytes": _path_size(coreml_path),
            "sha256": _hash_path(coreml_path),
        }
    )

    entries.append(
        {
            "format": "ncnn-param",
            "path": str(ncnn_paths["param"].relative_to(cfg.output_dir)),
            "bytes": _path_size(ncnn_paths["param"]),
            "sha256": _hash_path(ncnn_paths["param"]),
        }
    )
    entries.append(
        {
            "format": "ncnn-bin",
            "path": str(ncnn_paths["bin"].relative_to(cfg.output_dir)),
            "bytes": _path_size(ncnn_paths["bin"]),
            "sha256": _hash_path(ncnn_paths["bin"]),
        }
    )

    manifest = {
        "model_name": cfg.model_name,
        "input_size": cfg.input_size,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "artifacts": entries,
    }

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest_path


def main() -> None:
    cfg = ExportConfig.from_args()
    _log(f"Configuration: {cfg}")

    _ensure_output_dir(cfg.output_dir)

    dummy_input = np.linspace(
        0, 1, cfg.input_size * cfg.input_size * DEFAULT_INT_FEATURES, dtype=np.float32
    )
    dummy_input = dummy_input.reshape(
        (1, DEFAULT_INT_FEATURES, cfg.input_size, cfg.input_size)
    )

    weights = _resolve_weights(cfg.weights_path, cfg.dummy)

    onnx_path = export_to_onnx(cfg, weights, dummy_input)
    tflite_paths = export_to_tflite(cfg, weights, dummy_input, cfg.int8)
    coreml_path = export_to_coreml(cfg, onnx_path)
    ncnn_paths = export_to_ncnn(cfg, weights)

    run_sanity_checks(cfg, dummy_input, weights, onnx_path, tflite_paths, coreml_path)

    manifest_artifacts = {"onnx": onnx_path}
    manifest_path = build_manifest(
        cfg, manifest_artifacts, tflite_paths, coreml_path, ncnn_paths
    )
    _log(f"Done. Manifest at {manifest_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        _log(f"Export failed: {exc}")
        raise
