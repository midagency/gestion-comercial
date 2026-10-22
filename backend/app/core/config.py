"""
Configuración central del sistema.
Usa variables de entorno para que sea fácil de desplegar en cualquier entorno.
"""

from functools import lru_cache
from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- App ---
    APP_NAME: str = "Gestión Comercial"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = True
    API_PREFIX: str = "/api/v1"

    # --- Seguridad ---
    SECRET_KEY: str = "cambiar-esta-clave-en-produccion-usar-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- Base de datos ---
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/gestion_comercial"

    # --- CORS ---
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # --- Onboarding / demo ---
    CREATE_DEMO_DATA: bool = True

    # Solo desarrollo: create_all al arrancar. Producción: Alembic.
    AUTO_CREATE_SCHEMA: bool = True

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            if s.startswith("["):
                import json

                return list(json.loads(s))
            return [origin.strip() for origin in s.split(",") if origin.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
