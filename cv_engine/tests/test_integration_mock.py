import numpy as np

from cv_engine.impact.detector import ImpactDetector
from cv_engine.inference.model_registry import get_detection_engine


def test_integration_pipeline_mock():
    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(3)]
    # Heuristiken kan ge 0 eller 1 event beroende på overlap; det viktiga: inga exceptions.
    ImpactDetector(detector=get_detection_engine(mock=True)).run(frames)
