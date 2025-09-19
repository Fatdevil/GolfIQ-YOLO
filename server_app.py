"""
Import shim for tests: exposes `app` at top-level `server_app`.
Prefers server.app:app, falls back to server.main:app, and finally
creates a minimal app if neither exists.
"""

try:
    # vår föredragna modul
    from server.app import app  # type: ignore
except Exception:
    try:
        from server.main import app  # type: ignore
    except Exception:
        # sista fallback – skapa en minimal FastAPI-app med /health
        import os

        from fastapi import Depends, FastAPI
        from fastapi.middleware.cors import CORSMiddleware

        from server.security import require_api_key

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

            @app.get("/health")
            async def health():
                return {"status": "ok"}

            @app.get("/protected", dependencies=[Depends(require_api_key)])
            async def protected():
                return {"ok": True}

            return app

        app = create_app()
