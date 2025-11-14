from __future__ import annotations

from typing import Dict, Optional

from .schemas import CourseBundle, GeoPoint, GreenFMB, Hazard, HoleBundle

_COURSES: Dict[str, CourseBundle] = {}


def _seed_demo_courses() -> Dict[str, CourseBundle]:
    courses: Dict[str, CourseBundle] = {}

    demo_links = CourseBundle(
        id="demo-links",
        name="Demo Links",
        country="USA",
        bbox=[
            GeoPoint(lat=37.4305, lon=-122.1613),
            GeoPoint(lat=37.4338, lon=-122.1552),
        ],
        holes=[
            HoleBundle(
                number=1,
                par=4,
                tee_center=GeoPoint(lat=37.4318, lon=-122.1610),
                green=GreenFMB(
                    front=GeoPoint(lat=37.4329, lon=-122.1588),
                    middle=GeoPoint(lat=37.4332, lon=-122.1583),
                    back=GeoPoint(lat=37.4334, lon=-122.1578),
                ),
                hazards=[
                    Hazard(
                        id="1-fairway-bunker",
                        type="bunker",
                        name="Left Fairway Bunker",
                        polygon=None,
                        center=GeoPoint(lat=37.4321, lon=-122.1602),
                    )
                ],
            ),
            HoleBundle(
                number=2,
                par=3,
                tee_center=GeoPoint(lat=37.4326, lon=-122.1600),
                green=GreenFMB(
                    front=GeoPoint(lat=37.4335, lon=-122.1580),
                    middle=GeoPoint(lat=37.4337, lon=-122.1576),
                    back=GeoPoint(lat=37.4339, lon=-122.1571),
                ),
                hazards=[
                    Hazard(
                        id="2-green-bunker",
                        type="bunker",
                        polygon=None,
                        center=GeoPoint(lat=37.4333, lon=-122.1586),
                    ),
                    Hazard(
                        id="2-pond",
                        type="water",
                        name="Front Pond",
                        polygon=None,
                        center=GeoPoint(lat=37.4329, lon=-122.1589),
                    ),
                ],
            ),
            HoleBundle(
                number=3,
                par=5,
                tee_center=GeoPoint(lat=37.4312, lon=-122.1598),
                green=GreenFMB(
                    front=GeoPoint(lat=37.4342, lon=-122.1560),
                    middle=GeoPoint(lat=37.4344, lon=-122.1555),
                    back=GeoPoint(lat=37.4347, lon=-122.1551),
                ),
                hazards=[
                    Hazard(
                        id="3-stream",
                        type="water",
                        name="Crossing Creek",
                        polygon=None,
                        center=GeoPoint(lat=37.4326, lon=-122.1585),
                    )
                ],
            ),
        ],
    )
    courses[demo_links.id] = demo_links

    parkland = CourseBundle(
        id="demo-parkland",
        name="Demo Parkland",
        country="Scotland",
        bbox=[
            GeoPoint(lat=55.9484, lon=-3.2045),
            GeoPoint(lat=55.9507, lon=-3.1987),
        ],
        holes=[
            HoleBundle(
                number=1,
                par=4,
                tee_center=GeoPoint(lat=55.9489, lon=-3.2039),
                green=GreenFMB(
                    front=GeoPoint(lat=55.9497, lon=-3.2014),
                    middle=GeoPoint(lat=55.9499, lon=-3.2009),
                    back=GeoPoint(lat=55.9501, lon=-3.2003),
                ),
                hazards=[
                    Hazard(
                        id="p1-woods",
                        type="tree",
                        name="Right Woods",
                        center=GeoPoint(lat=55.9492, lon=-3.2025),
                    )
                ],
            ),
            HoleBundle(
                number=2,
                par=4,
                tee_center=GeoPoint(lat=55.9493, lon=-3.2035),
                green=GreenFMB(
                    front=GeoPoint(lat=55.9502, lon=-3.2007),
                    middle=GeoPoint(lat=55.9504, lon=-3.2002),
                    back=GeoPoint(lat=55.9506, lon=-3.1998),
                ),
                hazards=[
                    Hazard(
                        id="p2-fairway-bunker",
                        type="bunker",
                        center=GeoPoint(lat=55.9497, lon=-3.2020),
                    ),
                    Hazard(
                        id="p2-rough",
                        type="rough",
                        name="Thick Rough",
                        center=GeoPoint(lat=55.9499, lon=-3.2015),
                    ),
                ],
            ),
            HoleBundle(
                number=3,
                par=3,
                tee_center=GeoPoint(lat=55.9497, lon=-3.2028),
                green=GreenFMB(
                    front=GeoPoint(lat=55.9505, lon=-3.1999),
                    middle=GeoPoint(lat=55.9507, lon=-3.1994),
                    back=GeoPoint(lat=55.9508, lon=-3.1990),
                ),
                hazards=[
                    Hazard(
                        id="p3-pond",
                        type="water",
                        name="Greenside Pond",
                        center=GeoPoint(lat=55.9501, lon=-3.2010),
                    )
                ],
            ),
        ],
    )
    courses[parkland.id] = parkland

    return courses


_COURSES = _seed_demo_courses()


def list_course_ids() -> list[str]:
    return sorted(_COURSES.keys())


def get_course_bundle(course_id: str) -> Optional[CourseBundle]:
    return _COURSES.get(course_id)
