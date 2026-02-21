"""
Example service layer — put your business logic here, keeping routers thin.
"""


def get_health_info() -> dict:
    return {
        "status": "ok",
        "message": "Hackalytics API is running",
    }
