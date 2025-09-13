import os
import platform
import time
from typing import Any, Dict


async def health() -> Dict[str, Any]:
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
