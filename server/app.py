from server.api.main import app
from server.routes.cv_mock import router as cv_mock_router

from .routes.cv_analyze import router as cv_analyze_router

app.include_router(cv_mock_router)
app.include_router(cv_analyze_router)
