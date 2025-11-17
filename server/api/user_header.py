from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Header

# x-user-id is optional for now; we will start sending it from the web client.
UserIdHeader = Annotated[Optional[str], Header(alias="x-user-id")]
