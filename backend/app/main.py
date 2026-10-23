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
    # Producción: Alembic (scripts/start_cloud.sh → alembic upgrade head).
    if settings.AUTO_CREATE_SCHEMA and settings.DEBUG:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    # Red de seguridad: columnas de catálogo que a veces faltan si falló una migración
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            await conn.execute(text(
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(120)"
            ))
            await conn.execute(text(
                "ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id UUID"
            ))
            await conn.execute(text(
                "ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(8,4) DEFAULT 0"
            ))
            await conn.execute(text(
                "ALTER TABLE price_lists ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) DEFAULT 0"
            ))
            await conn.execute(text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS province VARCHAR(100)"
            ))
            await conn.execute(text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS city VARCHAR(100)"
            ))
            await conn.execute(text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)"
            ))
            await conn.execute(text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS address TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS email VARCHAR(255)"
            ))
            await conn.execute(text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone VARCHAR(40)"
            ))
            await conn.execute(text(
                "ALTER TABLE partners ADD COLUMN IF NOT EXISTS province VARCHAR(100)"
            ))
            await conn.execute(text(
                "ALTER TABLE partners ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)"
            ))
            # Tablas de stock por si create_all no las creó
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS stock_levels (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    variant_id UUID,
                    quantity NUMERIC(14,3) DEFAULT 0,
                    reserved_qty NUMERIC(14,3) DEFAULT 0,
                    min_qty NUMERIC(14,3) DEFAULT 0,
                    max_qty NUMERIC(14,3)
                )
            """))
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS stock_moves (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    variant_id UUID,
                    move_type VARCHAR(30) NOT NULL,
                    quantity NUMERIC(14,3) NOT NULL,
                    reference_type VARCHAR(40),
                    reference_id UUID,
                    notes TEXT,
                    created_by UUID,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
    except Exception as e:
        print(f"[lifespan] ensure columns skipped: {e}")
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
    allow_origins=settings.CORS_ORIGINS or ["*"],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers

@app.exception_handler(Exception)
async def unhandled_exception(request, exc):
    from fastapi.responses import JSONResponse
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc) or "Error interno del servidor"},
    )

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
