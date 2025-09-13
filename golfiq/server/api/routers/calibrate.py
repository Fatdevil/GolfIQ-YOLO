from fastapi import APIRouter, Query

router = APIRouter()


@router.get("/calibrate")
def calibrate(a4_width_px: float = Query(..., gt=0)):
    """Return scale in meters per pixel given A4 width in pixels.
    A4 width = 210 mm = 0.210 m.
    """
    scale = 0.210 / a4_width_px
    return {"scale_m_per_px": scale}
