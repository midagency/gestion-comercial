"""
API de Inventario: niveles de stock, movimientos, transferencias y alertas.
"""

import csv
import io
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.company import Warehouse
from app.schemas.inventory import (
    LowStockItem,
    StockLevelListResponse,
    StockLevelOut,
    StockLevelUpdate,
    StockMoveCreate,
    StockMoveListResponse,
    StockMoveOut,
    StockSummary,
)
from app.services import inventory as inventory_service

router = APIRouter(prefix="/inventory", tags=["Inventario"])


@router.get(
    "/warehouses",
    summary="Listar almacenes de la empresa",
)
async def list_warehouses(db: DBSession, current_user: CurrentUser):
    result = await db.execute(
        select(Warehouse)
        .where(
            Warehouse.company_id == current_user.company_id,
            Warehouse.is_active == True,  # noqa: E712
        )
        .order_by(Warehouse.name)
    )
    rows = result.scalars().all()
    return [
        {
            "id": w.id,
            "name": w.name,
            "code": w.code,
            "is_main": w.is_main,
            "branch_id": w.branch_id,
        }
        for w in rows
    ]


# ---------------------------------------------------------------------------
# Niveles de stock
# ---------------------------------------------------------------------------

@router.get(
    "/levels",
    response_model=StockLevelListResponse,
    summary="Listar niveles de stock",
    description="Filtrá por almacén, producto o solo los que están bajo el mínimo.",
)
async def list_stock_levels(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    warehouse_id: Optional[UUID] = None,
    product_id: Optional[UUID] = None,
    low_stock_only: bool = Query(False, description="Solo productos bajo el mínimo"),
    search: Optional[str] = Query(None, description="Busca por nombre o SKU del producto"),
):
    result = await inventory_service.list_stock_levels(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        warehouse_id=warehouse_id,
        product_id=product_id,
        low_stock_only=low_stock_only,
        search=search,
    )
    return StockLevelListResponse(
        items=[StockLevelOut(**item) for item in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get(
    "/levels/export",
    summary="Exportar stock a Excel/CSV (respeta filtros)",
)
async def export_stock_levels(
    db: DBSession,
    current_user: CurrentUser,
    warehouse_id: Optional[UUID] = None,
    product_id: Optional[UUID] = None,
    low_stock_only: bool = Query(False),
    search: Optional[str] = Query(None),
    brand: Optional[str] = Query(None, description="Filtro por marca de producto"),
):
    """Exporta el control de stock con los mismos filtros de la grilla."""
    result = await inventory_service.list_stock_levels(
        db,
        current_user.company_id,
        page=1,
        page_size=10000,
        warehouse_id=warehouse_id,
        product_id=product_id,
        low_stock_only=low_stock_only,
        search=search,
    )
    items = result["items"]
    if brand:
        brand_l = brand.strip().lower()
        items = [
            i
            for i in items
            if brand_l in str(i.get("product_brand") or i.get("brand") or "").lower()
        ]

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(
        [
            "SKU",
            "EAN",
            "Producto",
            "Marca",
            "Categoría",
            "Almacén",
            "Cantidad",
            "Mínimo",
            "Máximo",
            "Unidad",
        ]
    )
    for i in items:
        writer.writerow(
            [
                i.get("product_sku") or "",
                i.get("product_barcode") or "",
                i.get("product_name") or "",
                i.get("product_brand") or "",
                i.get("category_name") or "",
                i.get("warehouse_name") or "",
                i.get("qty_on_hand") if i.get("qty_on_hand") is not None else i.get("quantity", 0),
                i.get("min_qty") or "",
                i.get("max_qty") or "",
                i.get("unit") or "unit",
            ]
        )
    buf.seek(0)
    # BOM para que Excel abra bien UTF-8
    content = "\ufeff" + buf.getvalue()
    return StreamingResponse(
        iter([content]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="control_stock.csv"',
        },
    )


@router.get(
    "/levels/{level_id}",
    response_model=StockLevelOut,
    summary="Detalle de un nivel de stock",
)
async def get_stock_level(
    level_id: UUID, db: DBSession, current_user: CurrentUser
):
    level = await inventory_service.get_stock_level(
        db, current_user.company_id, level_id
    )
    if not level:
        raise HTTPException(status_code=404, detail="Nivel de stock no encontrado")
    return StockLevelOut(**level)


@router.patch(
    "/levels/{level_id}",
    response_model=StockLevelOut,
    summary="Actualizar umbrales (min/max)",
    description="No modifica la cantidad. Para eso usá un movimiento de tipo adjustment.",
)
async def update_stock_thresholds(
    level_id: UUID,
    data: StockLevelUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    level = await inventory_service.update_stock_thresholds(
        db, current_user.company_id, level_id, data
    )
    if not level:
        raise HTTPException(status_code=404, detail="Nivel de stock no encontrado")
    return StockLevelOut(**level)


# ---------------------------------------------------------------------------
# Movimientos
# ---------------------------------------------------------------------------

@router.post(
    "/moves",
    response_model=list[StockMoveOut],
    status_code=status.HTTP_201_CREATED,
    summary="Crear movimiento de stock",
    description=(
        "Tipos: **in** (entrada), **out** (salida), **transfer** (entre almacenes), "
        "**adjustment** (dejar el stock en un valor exacto). "
        "En transfer se generan 2 movimientos (origen y destino)."
    ),
)
async def create_stock_move(
    data: StockMoveCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    try:
        moves = await inventory_service.create_stock_move(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return [StockMoveOut.model_validate(m) for m in moves]


@router.get(
    "/moves",
    response_model=StockMoveListResponse,
    summary="Historial de movimientos",
)
async def list_stock_moves(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    warehouse_id: Optional[UUID] = None,
    product_id: Optional[UUID] = None,
    move_type: Optional[str] = Query(
        None, pattern="^(in|out|transfer|adjustment)$"
    ),
):
    result = await inventory_service.list_stock_moves(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        warehouse_id=warehouse_id,
        product_id=product_id,
        move_type=move_type,
    )
    return StockMoveListResponse(
        items=[StockMoveOut.model_validate(m) for m in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


# ---------------------------------------------------------------------------
# Resumen y alertas
# ---------------------------------------------------------------------------

@router.get(
    "/summary",
    response_model=StockSummary,
    summary="Resumen de inventario y alertas de stock bajo",
)
async def stock_summary(db: DBSession, current_user: CurrentUser):
    data = await inventory_service.get_stock_summary(db, current_user.company_id)
    return StockSummary(
        total_products_tracked=data["total_products_tracked"],
        total_warehouses=data["total_warehouses"],
        low_stock_count=data["low_stock_count"],
        zero_stock_count=data["zero_stock_count"],
        low_stock_items=[LowStockItem(**item) for item in data["low_stock_items"]],
    )
