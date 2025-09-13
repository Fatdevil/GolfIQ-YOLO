from typing import Dict


async def health() -> Dict[str, str]:
    """Simple health check endpoint."""
    return {"status": "ok"}
