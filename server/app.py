from server.api.main import app
from server.routes.cv_mock import router as cv_mock_router

app.include_router(cv_mock_router)
