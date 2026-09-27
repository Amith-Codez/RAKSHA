# RAKSHA server as a container, for any host that runs Docker (Railway, Fly.io, Koyeb, Google Cloud Run, a VPS).
# Render users can ignore this file: render.yaml uses Render's own Python runtime.
#   docker build -t raksha .
#   docker run -p 8000:8000 -e GEMINI_API_KEY=your-key raksha      → http://localhost:8000
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 PORT=8000 FORWARDED_ALLOW_IPS=*

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend backend
COPY extension-ready extension-ready
RUN useradd --create-home raksha && chown -R raksha /app
USER raksha

WORKDIR /app/backend
EXPOSE 8000
CMD ["python", "server.py"]
