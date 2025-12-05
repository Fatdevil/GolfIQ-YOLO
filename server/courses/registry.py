from __future__ import annotations

from server.courses.models import CourseLayout

DEMO_COURSES: dict[str, CourseLayout] = {
    "demo-links-hero": CourseLayout(
        id="demo-links-hero",
        name="Demo Links Hero",
        holes=[
            {
                "number": 1,
                "tee": {"lat": 59.3005, "lon": 18.0948},
                "green": {"lat": 59.3009, "lon": 18.0962},
            },
            {
                "number": 2,
                "tee": {"lat": 59.2998, "lon": 18.0971},
                "green": {"lat": 59.2994, "lon": 18.0986},
            },
            {
                "number": 3,
                "tee": {"lat": 59.2987, "lon": 18.1002},
                "green": {"lat": 59.2984, "lon": 18.1018},
            },
            {
                "number": 4,
                "tee": {"lat": 59.2976, "lon": 18.1031},
                "green": {"lat": 59.2972, "lon": 18.1044},
            },
            {
                "number": 5,
                "tee": {"lat": 59.2966, "lon": 18.106},
                "green": {"lat": 59.2962, "lon": 18.1074},
            },
        ],
        country=None,
        city=None,
    )
}
