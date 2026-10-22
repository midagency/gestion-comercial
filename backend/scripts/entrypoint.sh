#!/bin/sh
set -e

echo "[entrypoint] Esperando base de datos y aplicando migraciones..."

# Reintentos suaves por si Postgres aún no acepta conexiones
i=0
until alembic upgrade head; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] ERROR: no se pudieron aplicar migraciones tras 30 intentos"
    exit 1
  fi
  echo "[entrypoint] DB no lista o migración falló (intento $i/30), reintento en 2s..."
  sleep 2
done

echo "[entrypoint] Migraciones OK. Arrancando API..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
