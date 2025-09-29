import asyncio

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import server.app as server_app
from server.app import _api_key_dependency, app, lifespan


def test_api_key_dependency_allows_when_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("API_KEY", raising=False)

    dependency = _api_key_dependency()
    request = Request({"type": "http", "headers": [], "app": app})

    asyncio.run(dependency(request))


def test_api_key_dependency_rejects_invalid_key(monkeypatch) -> None:
    monkeypatch.setenv("API_KEY", "expected")

    dependency = _api_key_dependency()
    request = Request(
        {
            "type": "http",
            "headers": [(b"x-api-key", b"wrong")],
            "app": app,
        }
    )

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(dependency(request))

    assert excinfo.value.status_code == 401


def test_lifespan_retention_task_runs_and_cancels(monkeypatch) -> None:
    monkeypatch.setenv("RETENTION_DIRS", "/tmp/logs")
    monkeypatch.setenv("RETENTION_MINUTES", "5")

    sweep_calls = []
    real_sleep = asyncio.sleep

    def fake_sweep(dirs, minutes):
        sweep_calls.append((tuple(dirs), minutes))

    async def fast_sleep(seconds: float) -> None:
        sweep_calls.append(("sleep", seconds))
        await real_sleep(0)

    monkeypatch.setattr(server_app, "sweep_retention_once", fake_sweep)
    monkeypatch.setattr(server_app.asyncio, "sleep", fast_sleep)

    async def run_lifespan() -> None:
        async with lifespan(app):
            await real_sleep(0)

    asyncio.run(run_lifespan())

    assert sweep_calls[0] == (("/tmp/logs",), 5)
    assert ("sleep", 300) in sweep_calls
