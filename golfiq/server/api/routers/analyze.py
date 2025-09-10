from fastapi import APIRouter

router = APIRouter()


@router.post("/analyze")
def analyze():
    """Placeholder analyze endpoint used for health checks and compatibility."""
    return {"status": "ok"}
