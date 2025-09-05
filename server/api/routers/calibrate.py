from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/calibrate")
def calibrate(a4_width_px: float = Query(..., gt=0)):
    scale = 0.210 / a4_width_px  # 210 mm = 0.210 m
    return {"scale_m_per_px": scale}
