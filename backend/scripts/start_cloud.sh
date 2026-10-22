#!/usr/bin/env sh
# Arranque en plataformas cloud (Railway, Render, etc.)
# Uso: sh scripts/start_cloud.sh
set -e

echo "[start] Migraciones Alembic..."
alembic upgrade head

PORT="${PORT:-8000}"
echo "[start] Uvicorn en 0.0.0.0:${PORT}"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
