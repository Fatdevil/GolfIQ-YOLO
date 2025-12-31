import numpy as np
import pytest

from cv_engine.inference.model_registry import (
    DEFAULT_MODEL_VARIANT,
    get_detection_engine,
)
from cv_engine.inference.yolov10 import YoloV10Engine
from cv_engine.inference.yolov11 import YoloV11Engine


def test_default_model_variant(monkeypatch):
    monkeypatch.delenv("MODEL_VARIANT", raising=False)
    engine = get_detection_engine()
    assert isinstance(engine, YoloV10Engine)
    assert engine.variant == DEFAULT_MODEL_VARIANT


def test_invalid_variant_falls_back(monkeypatch, caplog):
    monkeypatch.setenv("MODEL_VARIANT", "banana")
    with caplog.at_level("WARNING"):
        engine = get_detection_engine()
    assert isinstance(engine, YoloV10Engine)
    assert any("Unknown MODEL_VARIANT" in rec.message for rec in caplog.records)


def test_yolov11_stub_is_explicit(monkeypatch):
    monkeypatch.setenv("MODEL_VARIANT", "yolov11")
    engine = get_detection_engine()
    assert isinstance(engine, YoloV11Engine)
    with pytest.raises(NotImplementedError):
        engine.run(np.zeros((4, 4, 3), dtype=np.uint8))

