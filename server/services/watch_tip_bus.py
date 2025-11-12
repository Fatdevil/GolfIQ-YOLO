from __future__ import annotations

from dataclasses import asdict, dataclass
from queue import Full, Queue
from threading import Lock
from time import time
from typing import Dict, List, Optional


@dataclass(slots=True)
class Tip:
    tipId: str
    title: str
    body: str
    club: Optional[str] = None
    playsLike_m: Optional[float] = None
    shotRef: Optional[dict] = None
    ts: int = 0

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


_TIPS: Dict[str, Dict[str, Tip]] = {}
_SUBSCRIBERS: Dict[str, List[Queue[Tip]]] = {}
_LOCK = Lock()
_QUEUE_MAXSIZE = 100


def publish(member_id: str, tip: Tip) -> Tip:
    with _LOCK:
        tips = _TIPS.setdefault(member_id, {})
        existing = tips.get(tip.tipId)
        if existing is not None:
            tip = existing
        else:
            if not tip.ts:
                tip.ts = int(time() * 1000)
            tips[tip.tipId] = tip
        for queue in _SUBSCRIBERS.get(member_id, []):
            try:
                queue.put_nowait(tip)
            except Full:
                continue
    return tip


def subscribe(member_id: str) -> Queue[Tip]:
    queue: Queue[Tip] = Queue(maxsize=_QUEUE_MAXSIZE)
    with _LOCK:
        _SUBSCRIBERS.setdefault(member_id, []).append(queue)
    return queue


def unsubscribe(member_id: str, queue: Queue[Tip]) -> None:
    with _LOCK:
        subscribers = _SUBSCRIBERS.get(member_id)
        if not subscribers:
            return
        if queue in subscribers:
            subscribers.remove(queue)
        if not subscribers:
            _SUBSCRIBERS.pop(member_id, None)


def list_tips(member_id: str) -> List[Tip]:
    with _LOCK:
        return list(_TIPS.get(member_id, {}).values())


def clear(member_id: Optional[str] = None) -> None:
    with _LOCK:
        if member_id is None:
            _TIPS.clear()
            _SUBSCRIBERS.clear()
        else:
            _TIPS.pop(member_id, None)
            _SUBSCRIBERS.pop(member_id, None)
