from fastapi import FastAPI
from .routers.coach import router as coach_router
from .routers import calibrate


app = FastAPI()
app.include_router(coach_router)
app.include_router(calibrate.router)


@app.post("/analyze")
async def analyze():
    """Simple analyze endpoint returning status."""
    return {"status": "ok"}
