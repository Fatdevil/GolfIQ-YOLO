from typing import List, Optional, Dict
from .base import DetectorBase, Detection

class YoloV8Detector(DetectorBase):
    """Thin wrapper around Ultralytics YOLOv8.
    This class lazy-imports 'ultralytics' so that the rest of the project and CI do not
    require the dependency. If 'ultralytics' is not installed, instantiation will raise
    a clear error when 'predict' is called.
    """
    def __init__(self, model_path: str, class_map: Optional[Dict[int, str]] = None, conf: float = 0.25):
        self.model_path = model_path
        self._model = None
        self.conf = conf
        # optional id->name mapping (e.g., {0: "ball", 1: "club_head"})
        self.class_map = class_map or {}

    def _ensure_model(self):
        if self._model is None:
            try:
                from ultralytics import YOLO  # type: ignore
            except Exception as e:
                raise RuntimeError("Ultralytics is not installed. Install 'ultralytics' to use YoloV8Detector.") from e
            self._model = YOLO(self.model_path)

    def predict(self, image) -> List[Detection]:
        self._ensure_model()
        results = self._model(source=image, conf=self.conf, verbose=False)[0]
        dets: List[Detection] = []
        if results.boxes is None:
            return dets
        import numpy as np
        boxes = results.boxes.xyxy.cpu().numpy()  # (N,4)
        cls_ids = results.boxes.cls.cpu().numpy().astype(int) if results.boxes.cls is not None else np.zeros(len(boxes), dtype=int)
        confs = results.boxes.conf.cpu().numpy() if results.boxes.conf is not None else np.ones(len(boxes))
        for (x1,y1,x2,y2), cid, cf in zip(boxes, cls_ids, confs):
            name = self.class_map.get(int(cid), str(int(cid)))
            dets.append(Detection(cls=name, conf=float(cf), x1=float(x1), y1=float(y1), x2=float(x2), y2=float(y2)))
        return dets
