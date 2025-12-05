from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from server.api.security import require_api_key
from server.bundles.hero_catalog import list_hero_course_summaries
from server.bundles.hero_models import HeroCourseSummary
from server.courses.models import CourseLayout
from server.courses.registry import DEMO_COURSES
from server.courses.schemas import CourseBundle
from server.courses.store import get_course_bundle, list_course_ids

router = APIRouter()

legacy_router = APIRouter(
    prefix="/api/courses",
    tags=["courses"],
    dependencies=[Depends(require_api_key)],
)


class CourseSummaryOut(BaseModel):
    id: str
    name: str
    country: str | None = None
    city: str | None = None
    holeCount: int


@router.get("/courses", response_model=list[CourseSummaryOut])
async def list_courses() -> list[CourseSummaryOut]:
    return [
        CourseSummaryOut(
            id=course.id,
            name=course.name,
            country=course.country,
            city=course.city,
            holeCount=len(course.holes),
        )
        for course in DEMO_COURSES.values()
    ]


@router.get("/courses/{course_id}/layout", response_model=CourseLayout)
async def get_course_layout(course_id: str) -> CourseLayout:
    try:
        return DEMO_COURSES[course_id]
    except KeyError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail="Course not found") from exc


@legacy_router.get("", response_model=list[str])
def get_course_ids() -> list[str]:
    """List available course bundle ids (MVP: static demo set)."""
    return list_course_ids()


@legacy_router.get("/{course_id}/bundle", response_model=CourseBundle)
def get_course_bundle_endpoint(course_id: str) -> CourseBundle:
    bundle = get_course_bundle(course_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="course_not_found")
    return bundle


@legacy_router.get("/hero", response_model=list[HeroCourseSummary])
def list_hero_courses() -> list[HeroCourseSummary]:
    """List curated hero courses with tee metadata."""
    return list_hero_course_summaries()


router.include_router(legacy_router)

__all__ = ["router"]
