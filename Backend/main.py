import sys
import os

# Ensure the Backend/ directory is always on sys.path — including in uvicorn's
# reload subprocess (SpawnProcess), which doesn't inherit the parent's path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import uvicorn
from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        reload_dirs=[os.path.dirname(os.path.abspath(__file__))],
    )
