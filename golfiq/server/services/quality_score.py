def quality_score(
    num_points: int, fps: float, calibrated: bool, coverage: float | None = None
) -> str:
    # coverage = fraction of frames where a track was available (0..1)
    cov = coverage if coverage is not None else 1.0
    if calibrated and fps >= 60 and num_points >= 4 and cov >= 0.6:
        return "green"
    if fps >= 30 and num_points >= 3 and cov >= 0.4:
        return "yellow"
    return "red"
