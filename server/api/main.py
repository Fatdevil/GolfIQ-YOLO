from fastapi import FastAPI

app = FastAPI()


@app.post("/analyze")
async def analyze():
    """Simple analyze endpoint returning status."""
    return {"status": "ok"}
