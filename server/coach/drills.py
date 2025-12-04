from __future__ import annotations

from typing import Literal, TypedDict

DrillCategory = Literal["driving", "approach", "short_game", "putting", "mixed"]


class Drill(TypedDict):
    id: str
    name: str
    description: str
    category: DrillCategory
    focus_metric: str
    difficulty: Literal["easy", "medium", "hard"]
    duration_minutes: int
    recommended_balls: int | None


DRILL_CATALOG: list[Drill] = [
    {
        "id": "driving-fairway-intervals",
        "name": "Fairway Finder Intervals",
        "description": "Alternate between conservative and full-speed tee shots focusing on start lines and commitment.",
        "category": "driving",
        "focus_metric": "fairways",
        "difficulty": "medium",
        "duration_minutes": 15,
        "recommended_balls": 12,
    },
    {
        "id": "driving-shape-ladder",
        "name": "9-Shot Driver Ladder",
        "description": "Hit a stock, fade, and draw in low/medium/high windows to build face-control trust.",
        "category": "driving",
        "focus_metric": "fairways",
        "difficulty": "hard",
        "duration_minutes": 20,
        "recommended_balls": 18,
    },
    {
        "id": "driving-distance-ramp",
        "name": "Speed Ramp with Landing Zone",
        "description": "3-ball sets: 1 smooth fairway finder, 2 speed swings toward a 30-yard landing corridor.",
        "category": "driving",
        "focus_metric": "distance",
        "difficulty": "medium",
        "duration_minutes": 15,
        "recommended_balls": 15,
    },
    {
        "id": "approach-3-distance",
        "name": "3-Distance Wedge Calibration",
        "description": "Hit 9 shots (3x at three stock distances) tracking carry numbers and dispersion.",
        "category": "approach",
        "focus_metric": "gir",
        "difficulty": "easy",
        "duration_minutes": 15,
        "recommended_balls": 12,
    },
    {
        "id": "approach-aim-tiers",
        "name": "Tiered Target Control",
        "description": "Pick front/middle/back targets; cycle through to train trajectory and landing depth.",
        "category": "approach",
        "focus_metric": "gir",
        "difficulty": "medium",
        "duration_minutes": 20,
        "recommended_balls": 15,
    },
    {
        "id": "wedge-clock",
        "name": "Clock Face Wedges",
        "description": "Use 9 o'clock and 10:30 swings to two targets; note carry gaps and spin window.",
        "category": "short_game",
        "focus_metric": "up_and_down",
        "difficulty": "easy",
        "duration_minutes": 15,
        "recommended_balls": 16,
    },
    {
        "id": "bunker-ups",
        "name": "3-Lie Bunker Matrix",
        "description": "Normal, buried, and uphill lies; 3 balls each focusing on entry point and finish height.",
        "category": "short_game",
        "focus_metric": "sand_saves",
        "difficulty": "medium",
        "duration_minutes": 15,
        "recommended_balls": 12,
    },
    {
        "id": "up-down-gauntlet",
        "name": "Up & Down Gauntlet",
        "description": "5 random lies around the green; must get 3/5 up-and-down before moving on.",
        "category": "short_game",
        "focus_metric": "up_and_down",
        "difficulty": "hard",
        "duration_minutes": 20,
        "recommended_balls": None,
    },
    {
        "id": "lag-putt-ladders",
        "name": "Lag Putting Ladder",
        "description": "Putt 3 balls each from 20/30/40 feet aiming for tap-in proximity; reset on 3-putt.",
        "category": "putting",
        "focus_metric": "3_putts",
        "difficulty": "easy",
        "duration_minutes": 15,
        "recommended_balls": None,
    },
    {
        "id": "pressure-3-footers",
        "name": "Pressure Circle 3-6ft",
        "description": "Make 12/15 inside 6 feet; restart the set if two misses in a row.",
        "category": "putting",
        "focus_metric": "short_putts",
        "difficulty": "medium",
        "duration_minutes": 15,
        "recommended_balls": None,
    },
    {
        "id": "comp-lag-holout",
        "name": "Lag + Clean Up",
        "description": "Putt from 30-50 feet then hole out; score -1 for 2-putt, -3 for 3-putt, 0 for 1-putt.",
        "category": "putting",
        "focus_metric": "3_putts",
        "difficulty": "medium",
        "duration_minutes": 20,
        "recommended_balls": None,
    },
    {
        "id": "mixed-nine-shot",
        "name": "9-Shot Iron Ladder",
        "description": "Stock, knockdown, and flighted draws/fades with mid-iron; focuses on face/path control.",
        "category": "mixed",
        "focus_metric": "control",
        "difficulty": "hard",
        "duration_minutes": 20,
        "recommended_balls": 18,
    },
    {
        "id": "mixed-updown-challenge",
        "name": "Up & Down Challenge Loop",
        "description": "Alternate chip/pitch to different pins then pressure putt; score +1 for saves, -1 for misses.",
        "category": "mixed",
        "focus_metric": "up_and_down",
        "difficulty": "medium",
        "duration_minutes": 20,
        "recommended_balls": None,
    },
    {
        "id": "distance-control-ladder",
        "name": "Distance Control Ladder",
        "description": "Pick 5-yard spacing targets from 110-150; must land inside 10% window before advancing.",
        "category": "approach",
        "focus_metric": "distance_control",
        "difficulty": "hard",
        "duration_minutes": 25,
        "recommended_balls": 20,
    },
]
