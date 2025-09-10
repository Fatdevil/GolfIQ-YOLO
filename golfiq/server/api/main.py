from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import analyze, calibrate, coach, infer

app = FastAPI(title="GolfIQ API", version="0.9.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(coach.router)
app.include_router(calibrate.router)
app.include_router(infer.router)


@app.get("/healthz")
def health():
    return {"ok": True}
