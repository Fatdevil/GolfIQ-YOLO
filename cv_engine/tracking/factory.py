from typing import List, Tuple

from ..types import Box


class _IdentityTracker:
    """Minimal stub: ger stabila track-ids 1..N per frame."""

    def update(self, boxes: List[Box]) -> List[Tuple[int, Box]]:
        return list(zip(range(1, len(boxes) + 1), boxes))


def get_tracker(name: str = "stub", **kwargs) -> _IdentityTracker:
    # framtida: byt till ByteTrack/DeepSort; nu: stub för tester
    return _IdentityTracker()
