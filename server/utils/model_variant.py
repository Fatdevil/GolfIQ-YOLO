from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from cv_engine.inference import model_registry
from server.storage.runs import VariantOverrideSource


@dataclass(frozen=True)
class VariantResolution:
    requested: Optional[str]
    selected: str
    override_source: VariantOverrideSource
    fallback_applied: bool


def resolve_variant(
    *,
    header: str | None = None,
    form: str | None = None,
    query: str | None = None,
    payload: str | None = None,
) -> VariantResolution:
    """Resolve a model variant override using allowlisted values."""

    env_default = os.getenv("MODEL_VARIANT")
    requested: str | None
    source: VariantOverrideSource
    if header is not None:
        requested = header
        source = VariantOverrideSource.HEADER
    elif form is not None:
        requested = form
        source = VariantOverrideSource.FORM
    elif query is not None:
        requested = query
        source = VariantOverrideSource.QUERY
    elif payload is not None:
        requested = payload
        source = VariantOverrideSource.PAYLOAD
    elif env_default is not None:
        requested = env_default
        source = VariantOverrideSource.ENV_DEFAULT
    else:
        requested = None
        source = VariantOverrideSource.NONE

    normalized = (
        model_registry._normalize_variant(  # type: ignore[attr-defined]
            requested, source=source.value if requested else "MODEL_VARIANT"
        )
        if hasattr(model_registry, "_normalize_variant")
        else model_registry.DEFAULT_MODEL_VARIANT
    )
    fallback_applied = bool(
        requested
        and requested.strip().lower() not in model_registry.ALLOWED_VARIANTS
        and normalized == model_registry.DEFAULT_MODEL_VARIANT
    )
    return VariantResolution(
        requested=requested,
        selected=normalized,
        override_source=source,
        fallback_applied=fallback_applied,
    )
