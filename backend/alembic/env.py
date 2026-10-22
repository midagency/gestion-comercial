"""
Alembic env – usa los modelos SQLAlchemy y DATABASE_URL del entorno.

Convierte postgresql+asyncpg:// → postgresql+psycopg2:// para migraciones síncronas.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Importar Base y todos los modelos para que metadata esté completa
from app.core.database import Base
import app.models  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """URL síncrona para Alembic (psycopg2).

    API (asyncpg) usa ``?ssl=require``.
    Alembic (psycopg2) necesita ``?sslmode=require``.
    """
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        url = config.get_main_option("sqlalchemy.url") or ""
    if not url:
        raise RuntimeError(
            "DATABASE_URL no está definida. En Render/Neon configurá "
            "postgresql+asyncpg://USER:PASS@HOST/DB?ssl=require"
        )
    for prefix in (
        "postgresql+asyncpg://",
        "postgres+asyncpg://",
        "postgresql://",
        "postgres://",
    ):
        if url.startswith(prefix):
            url = "postgresql+psycopg2://" + url[len(prefix) :]
            break
    # asyncpg: ssl= / channel_binding=  →  psycopg2: sslmode=
    import re

    url = re.sub(r"[&?]channel_binding=[^&]*", "", url)
    if "sslmode=" not in url:
        url = url.replace("ssl=require", "sslmode=require")
        url = url.replace("ssl=true", "sslmode=require")
    url = url.replace("?&", "?").rstrip("?&")
    return url


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
