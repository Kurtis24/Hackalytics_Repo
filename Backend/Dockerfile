FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY requirements.txt ./Backend/requirements.txt
RUN pip install --no-cache-dir -r Backend/requirements.txt

# Copy application code — build context should be repo root:
#   docker build -f Backend/Dockerfile -t sportsbook-pipeline .
COPY Backend/ ./Backend/

ENTRYPOINT ["python", "-m", "Backend.scripts.collect_data"]
