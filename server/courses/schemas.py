from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

HazardType = Literal["bunker", "water", "rough", "tree", "other"]


class GeoPoint(BaseModel):
    lat: float
    lon: float


class GeoPolygon(BaseModel):
    """Simple polygon described by rings in WGS84 coordinates."""

    rings: List[List[GeoPoint]]


class GreenFMB(BaseModel):
    front: GeoPoint
    middle: GeoPoint
    back: GeoPoint


class Hazard(BaseModel):
    id: str
    type: HazardType
    name: Optional[str] = None
    polygon: Optional[GeoPolygon] = None
    center: Optional[GeoPoint] = None


class HoleBundle(BaseModel):
    number: int
    par: int
    tee_center: GeoPoint
    green: GreenFMB
    hazards: List[Hazard] = Field(default_factory=list)


class CourseBundle(BaseModel):
    id: str
    name: str
    country: str
    holes: List[HoleBundle]
    bbox: Optional[List[GeoPoint]] = None
    version: int = 1
