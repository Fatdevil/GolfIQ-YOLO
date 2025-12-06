from __future__ import annotations

from typing import List

from pydantic import BaseModel


class LatLon(BaseModel):
    lat: float
    lon: float


class HoleLayout(BaseModel):
    number: int
    tee: LatLon
    green: LatLon


class CourseLayout(BaseModel):
    id: str
    name: str
    holes: List[HoleLayout]
    country: str | None = None
    city: str | None = None
    location: LatLon | None = None
