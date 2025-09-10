import os
import platform
import time

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    return {
        "status": "ok",
        "ts": time.time(),
        "env": {
            "coach_feature": os.getenv("COACH_FEATURE", "false"),
            "yolo_inference": os.getenv("YOLO_INFERENCE", "false"),
            "model": os.getenv("OPENAI_MODEL", ""),
        },
        "runtime": {
            "python": platform.python_version(),
        },
    }
