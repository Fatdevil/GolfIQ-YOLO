from typing import Dict, List, Optional


class BaseTracker:
    def update(self, detections: List[Dict]) -> List[Dict]:
        raise NotImplementedError


class SortLite(BaseTracker):
    def __init__(self) -> None:
        self._next = 1
        self._last: Optional[Dict] = None

    def update(self, detections: List[Dict]) -> List[Dict]:
        out: List[Dict] = []
        for det in detections:
            bbox = det.get("bbox") or det.get("xyxy")
            if bbox and len(bbox) == 4:
                track = dict(det)
                if "track_id" not in track:
                    if self._last and track.get("cls") == self._last.get("cls"):
                        track["track_id"] = self._last["track_id"]
                    else:
                        track["track_id"] = self._next
                        self._next += 1
                out.append(track)
                self._last = track
        return out


class ByteTrackStub(BaseTracker):
    def __init__(self) -> None:
        self._id = 100

    def update(self, detections: List[Dict]) -> List[Dict]:
        out: List[Dict] = []
        for det in detections:
            track = dict(det)
            track["track_id"] = track.get("track_id") or self._id
            out.append(track)
            self._id += 1
        return out


def get_tracker(name: str) -> BaseTracker:
    n = (name or "").lower()
    if n == "bytetrack":
        return ByteTrackStub()
    return SortLite()
