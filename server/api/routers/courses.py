from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from server.api.security import require_api_key
from server.bundles.hero_catalog import list_hero_course_summaries
from server.bundles.hero_models import HeroCourseSummary
from server.courses.schemas import CourseBundle
from server.courses.store import get_course_bundle, list_course_ids

router = APIRouter(
    prefix="/api/courses",
    tags=["courses"],
    dependencies=[Depends(require_api_key)],
)


@router.get("", response_model=list[str])
def get_course_ids() -> list[str]:
    """List available course bundle ids (MVP: static demo set)."""
    return list_course_ids()


@router.get("/{course_id}/bundle", response_model=CourseBundle)
def get_course_bundle_endpoint(course_id: str) -> CourseBundle:
    bundle = get_course_bundle(course_id)
    if not bundle:
        raise HTTPException(status_code=404, detail="course_not_found")
    return bundle


@router.get("/hero", response_model=list[HeroCourseSummary])
def list_hero_courses() -> list[HeroCourseSummary]:
    """List curated hero courses with tee metadata."""
    return list_hero_course_summaries()
