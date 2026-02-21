from fastapi import APIRouter, HTTPException

from app.models.game import Game
from app.services.games_service import get_all_upcoming_games

router = APIRouter(prefix="/games", tags=["Games"])


@router.get("", response_model=list[Game])
async def upcoming_games():
    """Return all upcoming scheduled games across NBA, MLB, NFL, and NHL."""
    try:
        return await get_all_upcoming_games()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
