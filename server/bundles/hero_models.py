from __future__ import annotations

from typing import Dict, Optional

from pydantic import BaseModel, Field

try:
    from pydantic import ConfigDict
except ImportError:  # pragma: no cover - pydantic v1 fallback
    ConfigDict = None


class HeroGeoPoint(BaseModel):
    lat: float
    lon: float


class HeroGreen(BaseModel):
    front: HeroGeoPoint
    middle: HeroGeoPoint
    back: HeroGeoPoint


class HeroTee(BaseModel):
    id: str
    label: str
    rating: Optional[float] = None
    slope: Optional[int] = None


class HeroHole(BaseModel):
    number: int
    par: int
    lengths_m: Dict[str, int] = Field(default_factory=dict, alias="lengths")
    tee_center: Optional[HeroGeoPoint] = Field(default=None, alias="teeCenter")
    green: Optional[HeroGreen] = None
    if ConfigDict:
        model_config = ConfigDict(populate_by_name=True)
    else:  # pragma: no cover - pydantic v1 fallback

        class Config:
            allow_population_by_field_name = True


class HeroCourse(BaseModel):
    id: str
    name: str
    country: Optional[str] = None
    city: Optional[str] = None
    tees: list[HeroTee] = Field(default_factory=list)
    holes: list[HeroHole] = Field(default_factory=list)
    if ConfigDict:
        model_config = ConfigDict(populate_by_name=True)
    else:  # pragma: no cover - pydantic v1 fallback

        class Config:
            allow_population_by_field_name = True


class HeroCourseSummary(BaseModel):
    id: str
    name: str
    country: Optional[str] = None
    city: Optional[str] = None
    tees: list[HeroTee] = Field(default_factory=list)
    holes: int
    par: int
    lengths_by_tee: Dict[str, int] = Field(default_factory=dict, alias="lengthsByTee")
    if ConfigDict:
        model_config = ConfigDict(populate_by_name=True)
    else:  # pragma: no cover - pydantic v1 fallback

        class Config:
            allow_population_by_field_name = True


__all__ = [
    "HeroCourse",
    "HeroCourseSummary",
    "HeroGeoPoint",
    "HeroGreen",
    "HeroHole",
    "HeroTee",
]
