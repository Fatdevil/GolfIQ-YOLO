from typing import Dict


async def health() -> Dict[str, bool]:
    """Simple health check endpoint."""
    return {"ok": True}
