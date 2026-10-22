"""
API del Punto de Venta (POS).
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DBSession
from app.schemas.pos import (
    POSProductQuick,
    POSProductSearchResponse,
    POSSaleCreate,
    POSSaleOut,
)
from app.services import pos as pos_service

router = APIRouter(prefix="/pos", tags=["Punto de Venta (POS)"])


@router.get(
    "/products",
    response_model=POSProductSearchResponse,
    summary="Buscar productos para POS",
    description="Búsqueda rápida por nombre, SKU o código de barras. Incluye precio de lista default y stock.",
)
async def search_products(
    db: DBSession,
    current_user: CurrentUser,
    q: Optional[str] = Query(None, description="Texto de búsqueda"),
    warehouse_id: Optional[UUID] = Query(None, description="Almacén para consultar stock"),
    limit: int = Query(20, ge=1, le=50),
):
    result = await pos_service.search_products_for_pos(
        db,
        current_user.company_id,
        q=q,
        warehouse_id=warehouse_id,
        limit=limit,
    )
    return POSProductSearchResponse(
        items=[POSProductQuick(**item) for item in result["items"]],
        total=result["total"],
    )


@router.post(
    "/sales",
    response_model=POSSaleOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar venta POS",
    description=(
        "Venta completa en un solo paso: valida sesión de caja, descuenta stock, "
        "crea pedido + factura + pagos, y registra efectivo en la sesión si corresponde. "
        "Soporta pago mixto (efectivo + tarjeta) y cálculo de vuelto."
    ),
)
async def create_pos_sale(
    data: POSSaleCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    try:
        result = await pos_service.create_pos_sale(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return POSSaleOut(**result)
