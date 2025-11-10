from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import moderation as mod
from server.schemas.moderation import ClipModerationState, ModerationAction, Visibility
from server.services import moderation_repo

client = TestClient(app, raise_server_exceptions=False)


def _make_state(
    clip_id: str, hidden: bool, visibility: Visibility
) -> ClipModerationState:
    return ClipModerationState(
        clipId=clip_id,
        hidden=hidden,
        visibility=visibility,
        reports=0,
        updatedTs=datetime.now(timezone.utc),
    )


def _allow_admin() -> None:
    app.dependency_overrides[mod.require_admin] = lambda: {"memberId": "host1"}


def _clear_admin() -> None:
    app.dependency_overrides.pop(mod.require_admin, None)


@pytest.fixture()
def isolated_repo(monkeypatch, tmp_path):
    monkeypatch.setenv("MODERATION_DATA_DIR", str(tmp_path))
    moderation_repo.reset()
    yield tmp_path
    moderation_repo.reset()


def test_hide_then_unhide_updates_repo(monkeypatch):
    _allow_admin()
    state: dict[str, object] = {"hidden": False, "visibility": Visibility.public}

    def fake_get_state(clip_id: str) -> ClipModerationState:
        return _make_state(clip_id, bool(state["hidden"]), state["visibility"])

    def fake_apply_action(
        clip_id: str,
        *,
        action: ModerationAction,
        visibility: Visibility | None = None,
        performed_by: str | None = None,
    ) -> ClipModerationState:
        if action is ModerationAction.hide:
            state["hidden"] = True
        elif action is ModerationAction.unhide:
            state["hidden"] = False
        elif action is ModerationAction.set_visibility and visibility is not None:
            state["visibility"] = visibility
        return _make_state(clip_id, bool(state["hidden"]), state["visibility"])

    monkeypatch.setattr(mod.moderation_repo, "get_state", fake_get_state, raising=True)
    monkeypatch.setattr(
        mod.moderation_repo, "apply_action", fake_apply_action, raising=True
    )

    try:
        hide_response = client.post(
            "/admin/moderation/clipX/action",
            json={"action": "hide"},
        )
        assert hide_response.status_code in (200, 202)
        assert hide_response.json()["hidden"] is True

        unhide_response = client.post(
            "/admin/moderation/clipX/action",
            json={"action": "unhide"},
        )
        assert unhide_response.status_code in (200, 202)
        assert unhide_response.json()["hidden"] is False
    finally:
        _clear_admin()


def test_set_visibility_event_enforced_in_read(monkeypatch):
    monkeypatch.setattr(
        mod.clips_repo,
        "get_clip",
        lambda clip_id: {
            "id": clip_id,
            "event_id": "event-1",
            "created_at": "2024-01-01T00:00:00Z",
        },
        raising=True,
    )
    monkeypatch.setattr(
        mod.clips_repo,
        "to_public",
        lambda record: {"id": record["id"], "eventId": record.get("event_id")},
        raising=True,
    )

    def fake_get_state(clip_id: str) -> ClipModerationState:
        return _make_state(clip_id, False, Visibility.event)

    monkeypatch.setattr(mod.moderation_repo, "get_state", fake_get_state, raising=True)

    forbidden = client.get("/clips/clipV", headers={"x-event-role": "spectator"})
    assert forbidden.status_code in (403, 404)

    allowed_headers = {"x-event-role": "spectator", "x-event-member": "member-1"}
    allowed = client.get("/clips/clipV", headers=allowed_headers)
    assert allowed.status_code == 200
    assert allowed.json()["id"] == "clipV"


def test_can_view_clip_branches():
    hidden_state = _make_state("clip-hidden", True, Visibility.public)
    assert mod._can_view_clip(hidden_state, role="spectator", member_id="m1") is False

    private_state = _make_state("clip-private", False, Visibility.private)
    assert mod._can_view_clip(private_state, role="spectator", member_id="m1") is False

    admin_state = _make_state("clip-admin", True, Visibility.private)
    assert mod._can_view_clip(admin_state, role=mod.ADMIN_ROLE, member_id=None) is True


def test_moderation_repo_logs_and_closes_reports(isolated_repo):
    log_dir = isolated_repo
    report = moderation_repo.record_report(
        "clip-log",
        reason="spam",
        details={"note": "test"},
        reporter="spectator-1",
    )
    assert report.status == "open"

    state = moderation_repo.apply_action(
        "clip-log",
        action=ModerationAction.set_visibility,
        visibility=Visibility.event,
        performed_by="admin-2",
    )
    assert state.visibility is Visibility.event
    assert state.reports == 0

    log_files = list(log_dir.iterdir())
    assert log_files, "moderation repo should append events to disk"
    contents = log_files[0].read_text(encoding="utf-8")
    assert '"type": "report"' in contents
    assert '"type": "action"' in contents
    assert '"visibility": "event"' in contents


def test_list_queue_filters_resolved_reports(isolated_repo):
    moderation_repo.record_report("clip-open", reason="abuse")
    moderation_repo.record_report("clip-closed", reason="spam")
    moderation_repo.apply_action("clip-closed", action=ModerationAction.hide)

    open_items = moderation_repo.list_queue()
    assert {item.clipId for item in open_items} == {"clip-open"}

    all_items = moderation_repo.list_queue(status="all")
    assert {item.clipId for item in all_items} == {"clip-open", "clip-closed"}


def test_resolve_visibility_normalizes_strings(isolated_repo):
    moderation_repo._CLIP_STATE["clip-string"] = {  # type: ignore[attr-defined]
        "clipId": "clip-string",
        "hidden": False,
        "visibility": "friends",
        "updatedTs": datetime.now(timezone.utc),
        "openReports": set(),
    }
    moderation_repo._OPEN_REPORTS["clip-string"] = set()  # type: ignore[attr-defined]

    visibility = moderation_repo.resolve_visibility("clip-string")
    assert visibility is Visibility.friends
    assert moderation_repo.is_hidden("clip-string") is False


def test_apply_action_requires_visibility_value(isolated_repo):
    with pytest.raises(ValueError):
        moderation_repo.apply_action(
            "clip-missing-visibility",
            action=ModerationAction.set_visibility,
        )


def test_apply_action_unhide_and_no_change_paths(isolated_repo):
    moderation_repo.record_report("clip-unhide", reason="flag")
    moderation_repo.apply_action("clip-unhide", action=ModerationAction.hide)
    state = moderation_repo.apply_action("clip-unhide", action=ModerationAction.unhide)
    assert state.hidden is False

    moderation_repo.record_report("clip-nochange", reason="duplicate")
    moderation_repo._CLIP_STATE["clip-nochange"]["hidden"] = True  # type: ignore[attr-defined]
    closed_state = moderation_repo.apply_action(
        "clip-nochange", action=ModerationAction.hide
    )
    assert closed_state.hidden is True


def test_json_default_handles_visibility():
    result = moderation_repo._json_default(Visibility.private)  # type: ignore[attr-defined]
    assert result == "private"
    payload = {"foo": "bar"}
    assert moderation_repo._json_default(payload) is payload  # type: ignore[attr-defined]


def test_apply_action_route_validates_visibility(monkeypatch):
    _allow_admin()
    try:
        response = client.post(
            "/admin/moderation/clipZ/action",
            json={"action": "set_visibility"},
        )
        assert response.status_code == 400
    finally:
        _clear_admin()


def test_read_clip_not_found(monkeypatch):
    def fake_get_clip(clip_id: str):
        raise mod.ClipNotFoundError(clip_id)

    monkeypatch.setattr(mod.clips_repo, "get_clip", fake_get_clip, raising=True)

    response = client.get("/clips/missing", headers={"x-event-role": "spectator"})
    assert response.status_code == 404


def test_list_event_clips_skips_records_without_id(monkeypatch):
    monkeypatch.setattr(
        mod.clips_repo,
        "list_for_event",
        lambda event_id: [{"eventId": event_id}],
        raising=True,
    )

    response = client.get(
        "/events/event-x/clips-feed",
        headers={"x-event-role": "spectator"},
    )
    assert response.status_code == 200
    assert response.json() == []


def test_update_open_reports_without_state(isolated_repo):
    moderation_repo._CLIP_STATE.pop("ghost", None)  # type: ignore[attr-defined]
    moderation_repo._OPEN_REPORTS.pop("ghost", None)  # type: ignore[attr-defined]

    moderation_repo._update_open_reports("ghost", {"rep-ghost"})  # type: ignore[attr-defined]
    assert moderation_repo._OPEN_REPORTS["ghost"] == {"rep-ghost"}  # type: ignore[attr-defined]


def test_close_reports_skips_missing_records(isolated_repo):
    moderation_repo._OPEN_REPORTS["clip-missing"] = {"rep-lost"}  # type: ignore[attr-defined]
    closed = moderation_repo._close_reports("clip-missing")  # type: ignore[attr-defined]
    assert closed == {"rep-lost"}


def test_apply_action_normalizes_existing_visibility(isolated_repo):
    moderation_repo._CLIP_STATE["clip-visibility"] = {  # type: ignore[attr-defined]
        "clipId": "clip-visibility",
        "hidden": False,
        "visibility": "private",
        "updatedTs": datetime.now(timezone.utc),
        "openReports": set(),
    }

    result = moderation_repo.apply_action(
        "clip-visibility",
        action=ModerationAction.set_visibility,
        visibility=Visibility.public,
    )
    assert result.visibility is Visibility.public
