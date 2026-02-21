from fastapi import APIRouter

from app.config import settings
from app.models.base import HealthResponse
from app.services.example_service import get_health_info

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=HealthResponse)
def health_check():
    info = get_health_info()
    return HealthResponse(
        status=info["status"],
        version=settings.app_version,
        message=info["message"],
    )
