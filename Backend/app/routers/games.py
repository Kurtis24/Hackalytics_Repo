from fastapi import APIRouter, HTTPException

from app.models.game import Game
from app.services.games_service import get_all_upcoming_games, get_all_live_games, get_all_games

router = APIRouter(prefix="/games", tags=["Games"])


@router.get("", response_model=list[Game])
async def upcoming_games():
    """Return all upcoming scheduled games across NBA, MLB, NFL, and NHL."""
    try:
        return await get_all_upcoming_games()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/live", response_model=list[Game])
async def live_games():
    """Return all currently live (in-progress) games across all leagues."""
    try:
        return await get_all_live_games()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/all", response_model=list[Game])
async def all_games():
    """Return both upcoming and live games (live=0 and live=1) across all leagues."""
    try:
        return await get_all_games()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
