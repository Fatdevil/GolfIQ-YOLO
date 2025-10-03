"""OpenTelemetry helper utilities for GolfIQ CV pipeline."""

from __future__ import annotations

import importlib
import importlib.util
import os
from typing import Any, Mapping, MutableMapping

__all__ = ["is_tracing_enabled", "span", "tracer"]


class _NullContextManager:
    def __enter__(self) -> None:  # noqa: D401 - simple noop
        return None

    def __exit__(self, exc_type, exc, tb) -> bool:  # type: ignore[override]
        return False


class _NullTracer:
    def start_as_current_span(
        self, name: str, *, attributes: Mapping[str, Any] | None = None
    ) -> _NullContextManager:
        return _NullContextManager()


_TRACER: Any | None = None

_FLAG_ENV_VARS = ("GOLFIQ_OTEL_ENABLED", "OTEL_GOLFIQ_ENABLED")
_DEFAULT_SCOPE = "golfiq.cv.pipeline"


def is_tracing_enabled() -> bool:
    """Return True when OTEL tracing should be enabled for the process."""

    for name in _FLAG_ENV_VARS:
        value = os.getenv(name)
        if value is None:
            continue
        if value.strip().lower() in {"1", "true", "yes", "on"}:
            return True
        return False
    return False


def tracer() -> Any:
    """Return a configured tracer (or a noop tracer when disabled)."""

    global _TRACER
    if _TRACER is not None:
        return _TRACER

    if not is_tracing_enabled():
        _TRACER = _NullTracer()
        return _TRACER

    if not _otel_dependencies_present():
        _TRACER = _NullTracer()
        return _TRACER

    _TRACER = _build_tracer()
    return _TRACER


def span(name: str, *, attributes: Mapping[str, Any] | None = None):
    """Context manager that yields an OTEL span when tracing is enabled."""

    current_tracer = tracer()
    if isinstance(current_tracer, _NullTracer):
        return _NullContextManager()
    return current_tracer.start_as_current_span(name, attributes=attributes)


def _otel_dependencies_present() -> bool:
    required = [
        "opentelemetry",  # core API
        "opentelemetry.trace",
        "opentelemetry.sdk.trace",
        "opentelemetry.sdk.trace.export",
        "opentelemetry.sdk.resources",
    ]
    for module_name in required:
        if importlib.util.find_spec(module_name) is None:
            return False
    exporter_choice = os.getenv("GOLFIQ_OTEL_EXPORTER", "otlp").strip().lower()
    if exporter_choice == "console":
        return True
    http_spec = importlib.util.find_spec(
        "opentelemetry.exporter.otlp.proto.http.trace_exporter"
    )
    grpc_spec = importlib.util.find_spec(
        "opentelemetry.exporter.otlp.proto.grpc.trace_exporter"
    )
    return http_spec is not None or grpc_spec is not None


def _build_tracer() -> Any:
    from opentelemetry import trace as trace_api
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import (
        BatchSpanProcessor,
        ConsoleSpanExporter,
        SimpleSpanProcessor,
    )

    instrumentation_scope = os.getenv("GOLFIQ_OTEL_SCOPE", _DEFAULT_SCOPE)

    existing_provider = trace_api.get_tracer_provider()
    if isinstance(existing_provider, TracerProvider) and getattr(
        existing_provider, "_golfiq_configured", False
    ):
        return trace_api.get_tracer(instrumentation_scope)

    exporter = _select_exporter()
    if exporter is None:
        return _NullTracer()

    resource_attributes: MutableMapping[str, Any] = {
        "service.name": os.getenv("OTEL_SERVICE_NAME", "golfiq-cv"),
        "service.namespace": os.getenv("OTEL_SERVICE_NAMESPACE", "golfiq"),
        "service.instance.id": os.getenv("HOSTNAME", "local"),
    }
    deployment_env = os.getenv("GOLFIQ_ENV")
    if deployment_env:
        resource_attributes["deployment.environment"] = deployment_env

    provider = TracerProvider(resource=Resource.create(resource_attributes))

    exporter_choice = os.getenv("GOLFIQ_OTEL_EXPORTER", "otlp").strip().lower()
    if exporter_choice == "console":
        provider.add_span_processor(SimpleSpanProcessor(exporter))
    else:
        provider.add_span_processor(BatchSpanProcessor(exporter))

    provider._golfiq_configured = True  # type: ignore[attr-defined]
    trace_api.set_tracer_provider(provider)
    return trace_api.get_tracer(instrumentation_scope)


def _select_exporter():
    exporter_choice = os.getenv("GOLFIQ_OTEL_EXPORTER", "otlp").strip().lower()
    if exporter_choice == "console":
        from opentelemetry.sdk.trace.export import ConsoleSpanExporter

        return ConsoleSpanExporter()

    http_module_name = "opentelemetry.exporter.otlp.proto.http.trace_exporter"
    grpc_module_name = "opentelemetry.exporter.otlp.proto.grpc.trace_exporter"

    if importlib.util.find_spec(http_module_name) is not None:
        http_module = importlib.import_module(http_module_name)
        return http_module.OTLPSpanExporter()
    if importlib.util.find_spec(grpc_module_name) is not None:
        grpc_module = importlib.import_module(grpc_module_name)
        return grpc_module.OTLPSpanExporter()
    return None
