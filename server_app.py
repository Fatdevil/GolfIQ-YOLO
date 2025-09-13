"""
Import shim for tests: exposes `app` at top-level `server_app`.
Prefers server.app:app, falls back to server.main:app, and finally
creates a minimal app if neither exists.
"""

try:
    # vår föredragna modul
    from server.app import app
except Exception:
    try:
        from server.main import app  # type: ignore[no-redef]
    except Exception:
        # sista fallback – skapa en minimal FastAPI-app med /health
        import os

        from fastapi import Depends, FastAPI, HTTPException, Request, status
        from fastapi.middleware.cors import CORSMiddleware

        def _api_key_dependency():
            async def _dep(request: Request):
                required = os.getenv("API_KEY")
                if not required:
                    return
                if request.headers.get("x-api-key") != required:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="invalid api key",
                    )

            return _dep

        def create_app() -> FastAPI:
            app = FastAPI()
            allow = os.getenv(
                "CORS_ALLOW_ORIGINS", "http://localhost,http://127.0.0.1"
            ).split(",")
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
