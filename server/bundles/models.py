from __future__ import annotations

from typing import Any, List, Optional, Tuple

from pydantic import BaseModel, Field

Coordinate = Tuple[float, float]


class CourseHole(BaseModel):
    hole: int
    par: int
    polyline: List[Coordinate]
    green_center: Optional[Coordinate] = None
    hazards: Optional[List[dict[str, Any]]] = None


class CourseBundle(BaseModel):
    id: str
    name: str
    country: Optional[str] = None
    tees: List[str] = Field(default_factory=list)
    holes: List[CourseHole]
    bbox: Optional[List[Coordinate]] = None


__all__ = ["CourseBundle", "CourseHole", "Coordinate"]
