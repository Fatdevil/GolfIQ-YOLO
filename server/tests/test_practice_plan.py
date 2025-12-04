from server.coach import build_practice_plan


def test_practice_plan_prioritizes_putting():
    weekly_summary = {
        "categories": {
            "driving": {"grade": "B"},
            "approach": {"grade": "B"},
            "short_game": {"grade": "C"},
            "putting": {"grade": "D"},
        },
        "focus_hints": ["Cut 3-putts"]
    }
    strokes_gained = {
        "categories": {
            "driving": {"value": 0.1},
            "approach": {"value": 0.2},
            "short_game": {"value": -0.1},
            "putting": {"value": -1.2},
        }
    }

    plan = build_practice_plan(weekly_summary, strokes_gained, max_minutes=60)

    assert plan["focus_categories"][0] == "putting"
    putting_drills = [d for d in plan["drills"] if d["category"] == "putting"]
    assert putting_drills


def test_practice_plan_balanced_when_no_data():
    plan = build_practice_plan({}, None, max_minutes=45)
    assert len(plan["drills"]) > 0
    assert set(plan["focus_categories"]) >= {"driving", "approach", "short_game", "putting"}
