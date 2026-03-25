FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app source
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/ ./data/

# Cloud Run sets PORT env var; default to 8080
ENV PORT=8080

CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
