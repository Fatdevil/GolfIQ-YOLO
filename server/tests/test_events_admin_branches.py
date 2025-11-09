from __future__ import annotations

import importlib
from typing import List, Tuple

import pytest
from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def _setup_repo(monkeypatch: pytest.MonkeyPatch) -> Tuple[object, object, str]:
    mod = importlib.import_module("server.routes.events")
    repo = mod._MemoryEventsRepository()
    event = repo.create_event("Coverage Run", None, code="ABCDEF1")
    monkeypatch.setattr(mod, "_REPOSITORY", repo)
    return mod, repo, event["id"]


def _admin_headers(member: str = "host-1") -> dict[str, str]:
    return {"x-event-role": "admin", "x-event-member": member}


def test_start_pause_close_emit_actions(monkeypatch: pytest.MonkeyPatch) -> None:
    mod, repo, event_id = _setup_repo(monkeypatch)

    actions: List[Tuple[tuple, dict]] = []
    monkeypatch.setattr(
        mod,
        "record_host_action",
        lambda *args, **kwargs: actions.append((args, kwargs)),
    )

    headers = _admin_headers("member-1")
    for endpoint in ("start", "pause", "close"):
        response = client.post(f"/events/{event_id}/{endpoint}", headers=headers)
        assert response.status_code in (200, 201, 204)

    assert len(actions) == 3
    assert {entry[0][1] for entry in actions} == {"start", "pause", "close"}
    # ensure the repo status was updated by the final call
    assert repo.get_event(event_id)["status"] == "closed"


def test_register_players_empty_list_returns_400(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod, repo, event_id = _setup_repo(monkeypatch)

    response = client.post(
        f"/events/{event_id}/players",
        json={"players": []},
        headers=_admin_headers(),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "no players provided"


def test_update_settings_partial_preserves_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, repo, event_id = _setup_repo(monkeypatch)
    headers = _admin_headers()

    response = client.patch(
        f"/events/{event_id}/settings",
        json={"grossNet": "gross"},
        headers=headers,
    )

    assert response.status_code in (200, 204)
    payload = response.json()
    assert payload["grossNet"] == "gross"
    assert payload["tvFlags"] == {
        "showQrOverlay": False,
        "autoRotateTop": True,
        "rotateIntervalMs": None,
    }

    # repo should also persist the normalized defaults
    settings = repo.get_settings(event_id)
    assert settings["grossNet"] == "gross"
    assert settings["tvFlags"]["autoRotateTop"] is True


def test_update_settings_invalid_type_returns_422(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _setup_repo(monkeypatch)
    headers = _admin_headers()

    response = client.patch(
        "/events/invalid/settings",
        json={"tvFlags": {"rotateIntervalMs": "fast"}},
        headers=headers,
    )

    assert response.status_code == 422


def test_regenerate_code_uses_fallback_and_placeholder(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod, repo, event_id = _setup_repo(monkeypatch)
    original_code = repo.get_event(event_id)["code"]

    # Force generate_code to collide so fallback path is executed
    monkeypatch.setattr(mod, "generate_code", lambda: original_code)
    monkeypatch.setattr(mod, "_random_indexes", lambda count: list(range(count)))

    qr_mod = importlib.import_module("server.utils.qr_svg")
    monkeypatch.setattr(qr_mod, "qr_svg", lambda *args, **kwargs: None)
    monkeypatch.setattr(qr_mod, "qr_svg_placeholder", lambda *args, **kwargs: "<svg />")

    actions: List[Tuple[tuple, dict]] = []
    monkeypatch.setattr(
        mod,
        "record_host_action",
        lambda *args, **kwargs: actions.append((args, kwargs)),
    )

    headers = _admin_headers("member-2")
    response = client.post(
        f"/events/{event_id}/code/regenerate",
        headers=headers,
    )

    assert response.status_code in (200, 201)
    payload = response.json()
    assert payload["code"] != original_code
    assert payload["qrSvg"].startswith("<svg")
    assert any(entry[0][1] == "code.regenerate" for entry in actions)


def test_regenerate_code_returns_503_when_codes_exhausted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod, repo, event_id = _setup_repo(monkeypatch)

    monkeypatch.setattr(repo, "resolve_event_by_code", lambda *_: {"id": "used"})
    monkeypatch.setattr(mod, "generate_code", lambda: "DUPLIC1")

    response = client.post(
        f"/events/{event_id}/code/regenerate",
        headers=_admin_headers("member-err"),
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "unable to allocate join code"


def test_regenerate_code_returns_404_when_repo_returns_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod, repo, event_id = _setup_repo(monkeypatch)

    monkeypatch.setattr(mod, "record_host_action", lambda *a, **k: None)
    monkeypatch.setattr(repo, "regenerate_code", lambda *_: None)

    headers = _admin_headers("member-3")
    response = client.post(
        f"/events/{event_id}/code/regenerate",
        headers=headers,
    )

    assert response.status_code == 404
    body = response.json()
    assert body["detail"] == "event not found"


def test_regenerate_code_injects_placeholder_when_svg_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod, repo, event_id = _setup_repo(monkeypatch)

    monkeypatch.setattr(mod, "generate_code", lambda: "NEWCODE")
    monkeypatch.setattr(mod, "qr_svg", lambda *_: None)
    monkeypatch.setattr(mod, "qr_svg_placeholder", lambda *_: "<svg placeholder />")

    response = client.post(
        f"/events/{event_id}/code/regenerate",
        headers=_admin_headers("member-qr"),
    )

    assert response.status_code in (200, 201)
    assert response.json()["qrSvg"] == "<svg placeholder />"


def test_board_reflects_gross_and_net_modes(monkeypatch: pytest.MonkeyPatch) -> None:
    mod, repo, event_id = _setup_repo(monkeypatch)

    repo._boards[event_id] = [
        {
            "name": "A",
            "gross": 72,
            "net": 70.4,
            "thru": 18,
            "hole": 18,
            "updated_at": "2024-01-01T00:00:01Z",
        },
        {
            "name": "B",
            "gross": 70,
            "net": 68.1,
            "thru": 18,
            "hole": 18,
            "updated_at": "2024-01-01T00:00:02Z",
        },
    ]

    first = client.get(f"/events/{event_id}/board")
    assert first.status_code == 200
    assert first.json()["grossNet"] == "net"

    repo.update_settings(event_id, settings={"grossNet": "gross"})

    second = client.get(f"/events/{event_id}/board")
    assert second.status_code == 200
    assert second.json()["grossNet"] == "gross"


def test_start_pause_close_unknown_event_returns_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod = importlib.import_module("server.routes.events")
    repo = mod._MemoryEventsRepository()
    monkeypatch.setattr(mod, "_REPOSITORY", repo)

    headers = _admin_headers("member-missing")
    for action in ("start", "pause", "close"):
        response = client.post(f"/events/missing/{action}", headers=headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "event not found"


def test_update_settings_missing_event_without_payload_returns_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mod = importlib.import_module("server.routes.events")
    repo = mod._MemoryEventsRepository()
    monkeypatch.setattr(mod, "_REPOSITORY", repo)

    response = client.patch(
        "/events/missing/settings",
        json={},
        headers=_admin_headers("member-settings"),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "event not found"


def test_host_state_missing_event_returns_404(monkeypatch: pytest.MonkeyPatch) -> None:
    mod = importlib.import_module("server.routes.events")
    repo = mod._MemoryEventsRepository()
    monkeypatch.setattr(mod, "_REPOSITORY", repo)

    response = client.get(
        "/events/missing/host",
        headers=_admin_headers("member-host"),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "event not found"
