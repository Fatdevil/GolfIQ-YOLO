from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Tuple, Union
from typing import Literal

from pydantic import BaseModel, Field


class PointGeometry(BaseModel):
    """Simple GeoJSON point geometry."""

    type: Literal["Point"] = "Point"
    coordinates: Tuple[float, float]

    def to_geojson(self) -> Dict[str, Any]:
        return {"type": self.type, "coordinates": list(self.coordinates)}


class PolygonGeometry(BaseModel):
    """Simple GeoJSON polygon geometry supporting one or more rings."""

    type: Literal["Polygon"] = "Polygon"
    coordinates: List[List[Tuple[float, float]]]

    def to_geojson(self) -> Dict[str, Any]:
        rings: List[List[List[float]]] = []
        for ring in self.coordinates:
            rings.append([[lon, lat] for lon, lat in ring])
        return {"type": self.type, "coordinates": rings}


Geometry = Union[PointGeometry, PolygonGeometry]


class Feature(BaseModel):
    """GeoJSON feature wrapper for course geometry primitives."""

    id: str
    geometry: Geometry
    properties: Dict[str, Any] = Field(default_factory=dict)

    def to_geojson(self) -> Dict[str, Any]:
        return {
            "type": "Feature",
            "id": self.id,
            "geometry": self.geometry.to_geojson(),
            "properties": self.properties,
        }


class Hole(BaseModel):
    """Represents a single hole with its spatial features."""

    number: int
    name: Optional[str] = None
    par: Optional[int] = None
    yardage: Optional[int] = None
    features: List[Feature] = Field(default_factory=list)

    def to_feature_collection(self) -> Dict[str, Any]:
        properties: Dict[str, Any] = {
            "hole": {
                "number": self.number,
                "name": self.name,
                "par": self.par,
                "yardage": self.yardage,
                "feature_count": len(self.features),
            }
        }
        return feature_collection(self.features, properties=properties)


class CourseBundle(BaseModel):
    """A collection of holes for a specific course, with cache hints."""

    id: str
    name: Optional[str] = None
    holes: List[Hole] = Field(default_factory=list)
    etag: Optional[str] = None
    ttl_seconds: int = 0

    def to_feature_collection(self) -> Dict[str, Any]:
        course_properties: Dict[str, Any] = {
            "course": {
                "id": self.id,
                "name": self.name,
                "hole_count": len(self.holes),
                "holes": [
                    {
                        "number": hole.number,
                        "name": hole.name,
                        "par": hole.par,
                        "yardage": hole.yardage,
                        "feature_count": len(hole.features),
                    }
                    for hole in self.holes
                ],
            }
        }
        features: List[Feature] = []
        for hole in self.holes:
            features.extend(hole.features)
        return feature_collection(features, properties=course_properties)


def feature_collection(
    features: Iterable[Feature], *, properties: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Convert feature models into a GeoJSON FeatureCollection."""

    payload = {
        "type": "FeatureCollection",
        "features": [feature.to_geojson() for feature in features],
    }
    if properties:
        payload["properties"] = properties
    return payload
