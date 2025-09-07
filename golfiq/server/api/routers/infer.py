from fastapi import APIRouter
from ...schemas.infer_req import InferRequest
from ...schemas.analyze_req_res import AnalyzeResponse
from ...services.infer_service import run_infer

router = APIRouter()

@router.post("/infer", response_model=AnalyzeResponse)
def infer(req: InferRequest):
    return run_infer(req)
