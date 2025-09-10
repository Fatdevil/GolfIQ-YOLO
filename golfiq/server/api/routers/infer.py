from fastapi import APIRouter

from ...schemas.infer_req_res import InferRequest, InferResponse
from ...services.infer_service import run_infer

router = APIRouter()


@router.post("/infer", response_model=InferResponse)
def infer(req: InferRequest):
    return run_infer(req)
