from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


RUNTIMES_BY_EXTENSION = {
    ".tflite": "tflite",
    ".onnx": "onnx",
    ".bin": "ncnn",
    ".param": "ncnn",
    ".mlmodel": "coreml",
    ".mlmodelc": "coreml",
    ".mlpackage": "coreml",
}

QUANT_TOKENS = {"int8", "fp16", "fp32"}


class ManifestError(Exception):
    """Raised when the manifest cannot be constructed."""


@dataclass
class ModelEntry:
    platform: str
    identifier: str
    url: str
    path: Path
    runtime: str
    input_size: int
    quant: str
    sha256: str
    size: int


def _iter_model_files(root: Path) -> Iterable[tuple[str, Path]]:
    for platform_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        platform = platform_dir.name.lower()
        if platform not in {"android", "ios"}:
            continue
        for file_path in sorted(platform_dir.iterdir()):
            if file_path.is_file():
                yield platform, file_path


def _detect_runtime(path: Path) -> str:
    extension = path.suffix.lower()
    runtime = RUNTIMES_BY_EXTENSION.get(extension)
    if not runtime:
        raise ManifestError(f"Unsupported runtime for file: {path.name}")
    return runtime


def _parse_identifier(path: Path) -> str:
    name = path.stem
    if not name:
        raise ManifestError(f"Unable to derive identifier from {path.name}")
    safe = name.replace(" ", "-")
    if ".." in safe:
        raise ManifestError(f"Invalid identifier derived from {path.name}")
    return safe


def _parse_quant(identifier: str) -> str:
    parts = identifier.lower().split("-")
    for token in parts[::-1]:
        if token in QUANT_TOKENS:
            return token
    raise ManifestError(f"Unable to determine quantization for {identifier}")


def _parse_input_size(identifier: str) -> int:
    for token in identifier.split("-")[::-1]:
        if token.isdigit():
            size = int(token)
            if size > 0:
                return size
    raise ManifestError(f"Unable to determine input size for {identifier}")


def _compute_sha256(path: Path) -> tuple[str, int]:
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    return digest, len(data)


def _build_entry(platform: str, file_path: Path, base_url: str) -> ModelEntry:
    identifier = _parse_identifier(file_path)
    runtime = _detect_runtime(file_path)
    quant = _parse_quant(identifier)
    input_size = _parse_input_size(identifier)
    sha256, size = _compute_sha256(file_path)
    relative = f"{platform}/{file_path.name}"
    url = f"{base_url.rstrip('/')}/{relative}"
    return ModelEntry(
        platform=platform,
        identifier=identifier,
        url=url,
        path=file_path,
        runtime=runtime,
        input_size=input_size,
        quant=quant,
        sha256=sha256,
        size=size,
    )


def build_manifest(root: Path, base_url: str, version: int, recommended: dict[str, str]) -> dict:
    entries: dict[str, list[ModelEntry]] = {"android": [], "ios": []}
    for platform, file_path in _iter_model_files(root):
        entry = _build_entry(platform, file_path, base_url)
        entries[platform].append(entry)

    manifest = {
        "version": version,
        "recommended": {k: v for k, v in recommended.items() if v},
    }
    for platform in ("android", "ios"):
        models = [
            {
                "id": entry.identifier,
                "url": entry.url,
                "sha256": entry.sha256,
                "size": entry.size,
                "runtime": entry.runtime,
                "inputSize": entry.input_size,
                "quant": entry.quant,
            }
            for entry in entries[platform]
        ]
        if models:
            manifest[platform] = models
    if not manifest.get("android") and not manifest.get("ios"):
        raise ManifestError("No models discovered in provided directory")
    if not manifest["recommended"]:
        manifest.pop("recommended")
    return manifest


def parse_recommended(values: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in values:
        if "=" not in item:
            raise ManifestError(
                "Recommended format should be <platform>=<model-id> (e.g. android=yolox-nano)"
            )
        platform, identifier = item.split("=", 1)
        platform = platform.strip().lower()
        identifier = identifier.strip()
        if platform not in {"android", "ios"}:
            raise ManifestError(f"Unsupported platform for recommendation: {platform}")
        if not identifier:
            raise ManifestError("Recommended identifier cannot be empty")
        result[platform] = identifier
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate edge model manifest metadata")
    parser.add_argument("root", type=Path, help="Directory containing platform model files")
    parser.add_argument("--base-url", required=True, help="Public base URL where models are hosted")
    parser.add_argument("--version", type=int, default=1, help="Manifest version (default: 1)")
    parser.add_argument(
        "--recommended",
        action="append",
        default=[],
        help="Optional recommended mapping (<platform>=<id>). Repeat for multiple platforms.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Where to write the manifest (defaults to stdout)",
    )

    args = parser.parse_args(argv)
    root = args.root.expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Root directory does not exist: {root}")

    try:
        recommended = parse_recommended(args.recommended)
        manifest = build_manifest(root, args.base_url.strip(), args.version, recommended)
    except ManifestError as error:
        parser.error(str(error))
        return 2  # pragma: no cover

    output = json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
