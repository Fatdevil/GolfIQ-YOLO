import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware

from .health import router as health_router
from .routers import calibrate
from .routers.coach import router as coach_router


class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        api_key = os.getenv("API_KEY")
        # Always allow health
        if request.url.path.startswith("/health"):
            return await call_next(request)
        if api_key:
            hdr = request.headers.get("x-api-key")
            if hdr != api_key:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)


app = FastAPI()

# --- CORS (from env) ---
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=(origins or ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ApiKeyMiddleware)

app.include_router(health_router)
app.include_router(coach_router)
app.include_router(calibrate.router)


@app.post("/analyze")
async def analyze():
    """Simple analyze endpoint returning status."""
    return {"status": "ok"}
