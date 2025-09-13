from fastapi import APIRouter

from ...schemas.coach_req_res import CoachRequest, CoachResponse
from ...services.coach_llm import generate

router = APIRouter()


@router.post("/coach", response_model=CoachResponse)
def coach(req: CoachRequest):
    txt = generate(mode=req.mode, metrics=req.metrics, notes=req.notes)
    return CoachResponse(text=txt)
