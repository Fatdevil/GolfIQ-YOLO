import os

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware


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


def create_app() -> FastAPI:
    app = FastAPI()

    app.state.STAGING = os.getenv("STAGING") == "1" or os.getenv("APP_ENV") == "staging"

    allow = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost,http://127.0.0.1").split(
        ","
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in allow if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api_dep = _api_key_dependency()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/protected", dependencies=[Depends(api_dep)])
    async def protected():
        return {"ok": True}

    return app


app = create_app()
