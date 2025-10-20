from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Dict, List, Mapping, Optional, Sequence

HudSummary = Dict[str, Any]
RoundSummary = Dict[str, Any]
ShareableRunSummary = Optional[Dict[str, Any]]


def guess_kind(run_id: str, payload: Any) -> str:
    if isinstance(payload, list):
        return "hud"
    if isinstance(payload, Mapping):
        holes = payload.get("holes")
        if isinstance(holes, list):
            return "round"
    if run_id.startswith("hud"):
        return "hud"
    if run_id.startswith("round"):
        return "round"
    return "unknown"


def build_shareable_summary(kind: str, payload: Any) -> ShareableRunSummary:
    if kind == "hud":
        summary = build_hud_summary(payload)
        return {"kind": kind, "summary": summary} if summary else None
    if kind == "round":
        summary = build_round_summary(payload)
        return {"kind": kind, "summary": summary} if summary else None
    return None


def describe_summary(summary: ShareableRunSummary) -> str:
    if not summary:
        return "Shared GolfIQ run"

    kind = summary.get("kind")
    details = summary.get("summary") or {}

    if kind == "hud":
        parts: List[str] = ["HUD session"]
        duration = details.get("durationSeconds")
        if isinstance(duration, (int, float)) and math.isfinite(duration) and duration > 0:
            parts.append(f"{format_duration(duration)} runtime")
        fps = details.get("averageFps")
        if isinstance(fps, (int, float)) and math.isfinite(fps):
            parts.append(f"{fps:.1f} FPS avg")
        latency = details.get("latencyP95Ms")
        if isinstance(latency, (int, float)) and math.isfinite(latency) and latency > 0:
            parts.append(f"p95 {round(latency)} ms latency")
        return " · ".join(parts)

    if kind == "round":
        pieces: List[str] = []
        course = details.get("courseName")
        if isinstance(course, str) and course.strip():
            pieces.append(course.strip())
        total_strokes = details.get("totalStrokes")
        total_par = details.get("totalPar")
        if isinstance(total_strokes, (int, float)) and isinstance(total_par, (int, float)):
            pieces.append(f"{int(total_strokes)} / {int(total_par)}")
        elif isinstance(total_strokes, (int, float)):
            pieces.append(f"{int(total_strokes)} strokes")
        gir_made = details.get("girMade")
        if isinstance(gir_made, (int, float)) and gir_made > 0:
            pieces.append(f"{int(gir_made)} GIR")
        fir_hit = details.get("firHit")
        if isinstance(fir_hit, (int, float)) and fir_hit > 0:
            pieces.append(f"{int(fir_hit)} FIR")
        if not pieces:
            pieces.append("Round summary")
        return " · ".join(pieces)

    return "Shared GolfIQ run"


def build_hud_summary(payload: Any) -> Optional[HudSummary]:
    if not isinstance(payload, Sequence) or isinstance(payload, (str, bytes, bytearray)):
        return None

    samples = [
        sample
        for sample in payload
        if isinstance(sample, Mapping)
    ]
    sample_count = len(samples)
    if sample_count == 0:
        return {"sampleCount": 0}

    timestamps = sorted(
        value
        for value in (
            extract_timestamp(sample)
            for sample in samples
        )
        if value is not None
    )
    duration = None
    if len(timestamps) >= 2:
        duration = max(0.0, (timestamps[-1] - timestamps[0]) / 1000.0)

    average_fps = average(collect_from_samples(samples, ["avg_fps", "fps", "frameRate"]))
    latency_p95 = average(
        collect_from_samples(samples, ["latency_ms_p95", "latencyP95", "p95_latency_ms", "latencyP95Ms"])
    )
    pin_distances = collect_from_samples(
        samples,
        ["pin_distance_m", "pinDistance", "pinDistanceMeters", "pin_distance", "pinMeters"],
    )
    pin_average = average(pin_distances)
    pin_best = min(pin_distances) if pin_distances else None
    recenter_count = count_recenter(samples)

    summary: HudSummary = {
        "sampleCount": sample_count,
    }
    if duration is not None:
        summary["durationSeconds"] = duration
    if average_fps is not None:
        summary["averageFps"] = average_fps
    if latency_p95 is not None:
        summary["latencyP95Ms"] = latency_p95
    if pin_average is not None:
        summary["pinAverageMeters"] = pin_average
    if pin_best is not None:
        summary["pinBestMeters"] = pin_best
    if recenter_count is not None:
        summary["recenterCount"] = recenter_count
    return summary


def build_round_summary(payload: Any) -> Optional[RoundSummary]:
    if not isinstance(payload, Mapping):
        return None

    holes = payload.get("holes")
    if not isinstance(holes, list):
        return None

    course_name = get_course_name(payload)
    parsed_holes = []
    gir_made = 0
    fir_hit = 0

    for index, raw in enumerate(holes, start=1):
        if not isinstance(raw, Mapping):
            continue
        par = get_number(raw.get("par") or raw.get("expected") or raw.get("parScore"))
        strokes = get_number(
            raw.get("strokes")
            or raw.get("score")
            or raw.get("strokesTaken")
            or raw.get("total")
        )
        gir = extract_boolean_flag(
            raw,
            ["gir", "greenInRegulation", "green_in_regulation", "greensInRegulation"],
        )
        fir = extract_boolean_flag(
            raw,
            ["fir", "fairwayInRegulation", "fairway_in_regulation", "fairwayHit", "fairway_hit"],
        )

        heuristic_gir = (
            gir
            if gir is not None
            else infer_gir_from_scores(
                strokes=strokes,
                par=par,
                putts=get_number(
                    raw.get("putts")
                    or raw.get("puttsTaken")
                    or raw.get("putts_count")
                    or raw.get("puttCount")
                ),
            )
        )
        heuristic_fir = (
            fir
            if fir is not None
            else infer_fir_from_hole(raw, par)
        )

        if heuristic_gir is True:
            gir_made += 1
        if heuristic_fir is True:
            fir_hit += 1

        parsed_holes.append(
            {
                "index": index,
                "par": par,
                "strokes": strokes,
                "gir": heuristic_gir,
                "fir": heuristic_fir,
            }
        )

    totals = [hole.get("strokes") for hole in parsed_holes]
    total_strokes = sum_numbers(totals)
    total_par = sum_numbers([hole.get("par") for hole in parsed_holes])

    return {
        "courseName": course_name,
        "totalStrokes": total_strokes,
        "totalPar": total_par,
        "holes": parsed_holes,
        "girMade": gir_made if gir_made else None,
        "firHit": fir_hit if fir_hit else None,
    }


def get_course_name(record: Mapping[str, Any]) -> Optional[str]:
    direct = record.get("course")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    if isinstance(direct, Mapping):
        maybe_name = direct.get("name")
        if isinstance(maybe_name, str) and maybe_name.strip():
            return maybe_name.strip()
    metadata = record.get("metadata")
    if isinstance(metadata, Mapping):
        name = metadata.get("course")
        if isinstance(name, str) and name.strip():
            return name.strip()
    return None


def extract_timestamp(sample: Mapping[str, Any]) -> Optional[float]:
    candidates = [
        sample.get("timestamp"),
        sample.get("timestampMs"),
        sample.get("timestamp_ms"),
        sample.get("ts"),
        sample.get("time"),
        sample.get("t"),
    ]
    for candidate in candidates:
        value = normalize_timestamp(candidate)
        if value is not None:
            return value
    return None


def normalize_timestamp(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.timestamp() * 1000.0
    if isinstance(value, (int, float)) and math.isfinite(value):
        if value > 10_000_000_000:
            return float(value)
        return float(value) * 1000.0
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.timestamp() * 1000.0
        except ValueError:
            try:
                numeric = float(value)
                if math.isfinite(numeric):
                    if numeric > 10_000_000_000:
                        return numeric
                    return numeric * 1000.0
            except ValueError:
                return None
    return None


def collect_from_samples(samples: Sequence[Mapping[str, Any]], keys: Sequence[str]) -> List[float]:
    values: List[float] = []
    for sample in samples:
        for key in keys:
            if key in sample:
                numeric = get_number(sample.get(key))
                if numeric is not None:
                    values.append(numeric)
            nested = sample.get("data")
            if isinstance(nested, Mapping) and key in nested:
                numeric = get_number(nested.get(key))
                if numeric is not None:
                    values.append(numeric)
    return values


def count_recenter(samples: Sequence[Mapping[str, Any]]) -> Optional[int]:
    count = 0
    for sample in samples:
        for field in ("event", "type", "name", "action"):
            value = sample.get(field)
            if isinstance(value, str) and "recenter" in value.lower():
                count += 1
                break
        else:
            nested = sample.get("data")
            if isinstance(nested, Mapping):
                for field in ("event", "type", "name"):
                    value = nested.get(field)
                    if isinstance(value, str) and "recenter" in value.lower():
                        count += 1
                        break
                else:
                    if nested.get("recenter") is True:
                        count += 1
    return count


def average(values: Sequence[float]) -> Optional[float]:
    filtered = [value for value in values if isinstance(value, (int, float)) and math.isfinite(value)]
    if not filtered:
        return None
    return sum(filtered) / len(filtered)


def get_number(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            numeric = float(value)
        except ValueError:
            return None
        if math.isfinite(numeric):
            return numeric
    return None


def get_boolean(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lower = value.strip().lower()
        if lower == "true":
            return True
        if lower == "false":
            return False
    return None


def extract_boolean_flag(record: Mapping[str, Any], keys: Sequence[str]) -> Optional[bool]:
    for key in keys:
        if key in record:
            flag = get_boolean(record.get(key))
            if flag is not None:
                return flag
    return None


def infer_gir_from_scores(
    *,
    strokes: Optional[float],
    par: Optional[float],
    putts: Optional[float],
) -> Optional[bool]:
    if strokes is None or par is None:
        return None
    if putts is not None:
        return (strokes - putts) <= (par - 2)
    return strokes <= par


def infer_fir_from_hole(hole: Mapping[str, Any], par: Optional[float]) -> Optional[bool]:
    if par is not None and par <= 3:
        return None
    tee_result = hole.get("teeShot") or hole.get("tee_shot") or hole.get("drive")
    if isinstance(tee_result, Mapping):
        flag = extract_boolean_flag(
            tee_result,
            ["fir", "fairwayInRegulation", "fairway_hit", "fairwayHit"],
        )
        if flag is not None:
            return flag
        lie = tee_result.get("lie") or tee_result.get("result")
        lie_flag = interpret_lie(lie)
        if lie_flag is not None:
            return lie_flag
    lie = hole.get("tee_lie") or hole.get("teeLie") or hole.get("lie")
    return interpret_lie(lie)


def interpret_lie(value: Any) -> Optional[bool]:
    if isinstance(value, str):
        lower = value.lower()
        if "fairway" in lower:
            return True
        if "rough" in lower or "penalty" in lower or "out" in lower:
            return False
    return None


def sum_numbers(values: Sequence[Optional[float]]) -> Optional[float]:
    filtered = [value for value in values if isinstance(value, (int, float)) and math.isfinite(value)]
    if not filtered:
        return None
    return float(sum(filtered))


def format_duration(seconds: float) -> str:
    if not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds <= 0:
        return "—"
    seconds_value = float(seconds)
    if seconds_value < 60:
        return f"{round(seconds_value)}s"
    minutes = int(seconds_value // 60)
    remaining = int(round(seconds_value % 60))
    if minutes < 60:
        return f"{minutes}m {str(remaining).zfill(2)}s"
    hours = minutes // 60
    minutes_part = minutes % 60
    return f"{hours}h {str(minutes_part).zfill(2)}m"
