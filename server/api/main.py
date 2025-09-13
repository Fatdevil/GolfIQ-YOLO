import asyncio
import os

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from server.retention.sweeper import sweep_retention_once

from .health import health as _health_handler
from .routers import calibrate, metrics
from .routers.coach import router as coach_router


def _api_key_dependency():
    async def _dep(request: Request):
        required = os.getenv("API_KEY")
        if not required:
            return
        provided = request.headers.get("x-api-key")
        if provided != required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key"
            )

    return _dep


app = FastAPI()
app.state.STAGING = os.getenv("STAGING") == "1" or os.getenv("APP_ENV") == "staging"

allow = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost,http://127.0.0.1").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allow if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_dep = _api_key_dependency()

app.include_router(coach_router)
app.include_router(calibrate.router)
app.include_router(metrics.router)
app.add_api_route("/health", _health_handler, methods=["GET"])


@app.get("/protected", dependencies=[Depends(api_dep)])
async def protected():
    return {"ok": True}


@app.on_event("startup")
async def _retention_startup():
    # Comma-separated directories to sweep, e.g. 'server/tmp_frames,server/uploads'
    dirs = [x.strip() for x in os.getenv("RETENTION_DIRS", "").split(",") if x.strip()]
    minutes = int(os.getenv("RETENTION_MINUTES", "15"))
    if not dirs:
        return

    async def _loop():
        while True:
            try:
                sweep_retention_once(dirs, minutes)
            finally:
                await asyncio.sleep(300)  # every 5 min

    asyncio.create_task(_loop())


@app.post("/analyze")
async def analyze():
    """Simple analyze endpoint returning status."""
    return {"status": "ok"}
