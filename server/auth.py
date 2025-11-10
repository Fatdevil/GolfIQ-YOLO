"""Authentication helpers for event admin checks."""

from fastapi import Header, HTTPException, status


ADMIN_ROLE = "admin"


def require_admin(
    role: str | None = Header(default=None, alias="x-event-role"),
    member_id: str | None = Header(default=None, alias="x-event-member"),
) -> str | None:
    """Ensure that the caller is an admin/host for the event."""

    if (role or "").lower() != ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="admin role required"
        )
    return member_id


__all__ = ["require_admin", "ADMIN_ROLE"]
