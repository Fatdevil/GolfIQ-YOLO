import numpy as np

from cv_engine.inference.yolo8 import YoloV8Detector


def test_yolo8_mock_returns_boxes():
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    boxes = YoloV8Detector(mock=True).run(img)
    labels = sorted([b.label for b in boxes])
    assert labels == ["ball", "club"]
