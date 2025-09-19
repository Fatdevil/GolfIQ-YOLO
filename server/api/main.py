# Lightweight shim so ASGI servers can import `server.api.main:app`
from server.app import app

__all__ = ["app"]
