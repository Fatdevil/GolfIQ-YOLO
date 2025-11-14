"""Pydantic models for access plans."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

PlanName = Literal["free", "pro"]


class AccessPlan(BaseModel):
    """Response payload for the current access plan."""

    plan: PlanName
