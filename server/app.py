import os
import pathlib

from fastapi.staticfiles import StaticFiles

from server.api.main import app
from server.routes.cv_mock import router as cv_mock_router

from .routes.cv_analyze import router as cv_analyze_router
from .routes.cv_analyze_video import router as cv_analyze_video_router
from .routes.runs import router as runs_router

app.include_router(cv_mock_router)
app.include_router(cv_analyze_router)
app.include_router(cv_analyze_video_router)
app.include_router(runs_router)

dist = pathlib.Path(__file__).resolve().parent.parent / "web" / "dist"

if os.getenv("SERVE_WEB", "0") == "1" and dist.exists():
    app.mount("/", StaticFiles(directory=str(dist), html=True), name="web")
