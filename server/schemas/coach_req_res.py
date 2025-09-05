from pydantic import BaseModel, Field
from typing import Literal, Optional, Dict, Any


class CoachRequest(BaseModel):
    mode: Literal["short", "detailed", "drill"] = "short"
    notes: str = ""
    metrics: Optional[Dict[str, Any]] = None


class CoachResponse(BaseModel):
    text: str = Field(..., description="coach feedback")

