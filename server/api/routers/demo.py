from fastapi import APIRouter

from server.services.demo_profile import DemoProfileResponse, build_demo_profile

router = APIRouter()


@router.get("/api/demo/profile", response_model=DemoProfileResponse)
def get_demo_profile() -> DemoProfileResponse:
    """Return a synthetic demo profile and analytics bundle."""

    return build_demo_profile()


__all__ = ["router"]
