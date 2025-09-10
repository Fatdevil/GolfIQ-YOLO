from fastapi import FastAPI

from .health import health as _health_handler
from .routers import calibrate
from .routers.coach import router as coach_router

app = FastAPI()
app.include_router(coach_router)
app.include_router(calibrate.router)
app.add_api_route("/health", _health_handler, methods=["GET"])


@app.post("/analyze")
async def analyze():
    """Simple analyze endpoint returning status."""
    return {"status": "ok"}
