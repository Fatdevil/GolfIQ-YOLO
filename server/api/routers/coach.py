from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from server.access.service import determine_plan
from server.schemas.coach_req_res import CoachRequest, CoachResponse
from server.schemas.coach_summary import CoachRoundSummary
from server.schemas.coach_diagnosis import CoachDiagnosis
from server.security import require_api_key
from server.services.coach_llm import generate
from server.services.coach_summary import build_coach_summary_for_run
from server.services.coach_diagnostics import build_diagnosis_for_run
from server.services.shortlinks import create

router = APIRouter()


def require_pro_plan(api_key: str | None = Depends(require_api_key)) -> str | None:
    plan = determine_plan(api_key).plan
    if plan != "pro":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="pro plan required"
        )
    return api_key


class CoachShareResponse(BaseModel):
    url: str
    sid: str


@router.post("/coach", response_model=CoachResponse)
def coach(req: CoachRequest):
    txt = generate(mode=req.mode, metrics=req.metrics, notes=req.notes)
    return CoachResponse(text=txt)


@router.get("/api/coach/round-summary/{run_id}", response_model=CoachRoundSummary)
def get_coach_round_summary(
    run_id: str, api_key: str | None = Depends(require_pro_plan)
) -> CoachRoundSummary:
    return build_coach_summary_for_run(run_id, _api_key=api_key)


@router.get("/api/coach/diagnosis/{run_id}", response_model=CoachDiagnosis)
def get_coach_diagnosis(
    run_id: str, api_key: str | None = Depends(require_pro_plan)
) -> CoachDiagnosis:
    return build_diagnosis_for_run(run_id)


@router.post("/api/coach/share/{run_id}", response_model=CoachShareResponse)
def create_coach_share(
    run_id: str, api_key: str | None = Depends(require_pro_plan)
) -> CoachShareResponse:
    summary = build_coach_summary_for_run(run_id, _api_key=api_key)
    payload = {
        "kind": "coach_round_summary",
        "run_id": run_id,
        "summary": summary.model_dump(),
    }

    shortlink = create(
        url=lambda sid: f"/coach/share/{sid}",
        title="GolfIQ • Coach report",
        description="Shared round summary for coaching",
        image=None,
        payload=payload,
    )

    return CoachShareResponse(url=f"/s/{shortlink.sid}", sid=shortlink.sid)
