"""
Punto de entrada de la API.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    auth,
    accounting,
    documents,
    extras,
    inventory,
    onboarding,
    partners,
    pos,
    products,
    purchases,
    reports,
    sales,
    settings as settings_api,
    treasury,
)
from app.core.config import get_settings
from app.core.database import Base, engine

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Desarrollo local sin Docker: create_all opcional.
    # Producción: Alembic (scripts/entrypoint.sh → alembic upgrade head).
    if settings.AUTO_CREATE_SCHEMA and settings.DEBUG:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Software de Gestión Comercial genérico y didáctico. "
        "Incluye asistente de configuración guiado para nuevos clientes."
    ),
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix=settings.API_PREFIX)
app.include_router(onboarding.router, prefix=settings.API_PREFIX)
app.include_router(partners.router, prefix=settings.API_PREFIX)
app.include_router(products.router, prefix=settings.API_PREFIX)
app.include_router(inventory.router, prefix=settings.API_PREFIX)
app.include_router(sales.router, prefix=settings.API_PREFIX)
app.include_router(purchases.router, prefix=settings.API_PREFIX)
app.include_router(treasury.router, prefix=settings.API_PREFIX)
app.include_router(pos.router, prefix=settings.API_PREFIX)
app.include_router(reports.router, prefix=settings.API_PREFIX)
app.include_router(documents.router, prefix=settings.API_PREFIX)
app.include_router(accounting.router, prefix=settings.API_PREFIX)
app.include_router(extras.router, prefix=settings.API_PREFIX)
app.include_router(settings_api.router, prefix=settings.API_PREFIX)


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs" if settings.DEBUG else None,
        "message": "API lista",
    }


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}
