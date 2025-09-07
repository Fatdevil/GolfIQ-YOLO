def quality_score(num_points: int, fps: float, calibrated: bool) -> str:
    """Return a simple quality assessment string based on available data."""
    if calibrated and num_points >= 10:
        return "green"
    if num_points >= 5:
        return "yellow"
    return "red"
