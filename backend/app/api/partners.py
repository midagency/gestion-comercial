"""
CRUD de Partners (Clientes y Proveedores).
Todos los endpoints requieren autenticación y operan solo sobre la empresa del usuario.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DBSession
from app.schemas.partner import (
    PartnerCreate,
    PartnerListResponse,
    PartnerOut,
    PartnerUpdate,
)
from app.services import partner as partner_service

router = APIRouter(prefix="/partners", tags=["Clientes y Proveedores"])


@router.get(
    "",
    response_model=PartnerListResponse,
    summary="Listar partners",
    description=(
        "Lista clientes y/o proveedores de la empresa del usuario. "
        "Soporta búsqueda, filtro por tipo, tags y paginación."
    ),
)
async def list_partners(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Busca en nombre, CUIT, email, teléfono, ciudad"),
    partner_type: Optional[str] = Query(
        None,
        pattern="^(customer|supplier|both)$",
        description="customer | supplier | both",
    ),
    is_active: Optional[bool] = Query(True, description="None = todos, True = solo activos, False = solo inactivos"),
    tags: Optional[str] = Query(None, description="Tags separados por coma. Ej: vip,mayorista"),
):
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None

    result = await partner_service.list_partners(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        search=search,
        partner_type=partner_type,
        is_active=is_active,
        tags=tag_list,
    )
    return PartnerListResponse(
        items=[PartnerOut.model_validate(p) for p in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get(
    "/{partner_id}",
    response_model=PartnerOut,
    summary="Obtener un partner",
)
async def get_partner(
    partner_id: UUID,
    db: DBSession,
    current_user: CurrentUser,
):
    partner = await partner_service.get_partner(db, current_user.company_id, partner_id)
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner no encontrado")
    return PartnerOut.model_validate(partner)


@router.post(
    "",
    response_model=PartnerOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear partner",
)
async def create_partner(
    data: PartnerCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    partner = await partner_service.create_partner(db, current_user.company_id, data)
    return PartnerOut.model_validate(partner)


@router.patch(
    "/{partner_id}",
    response_model=PartnerOut,
    summary="Actualizar partner (parcial)",
)
async def update_partner(
    partner_id: UUID,
    data: PartnerUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    partner = await partner_service.get_partner(db, current_user.company_id, partner_id)
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner no encontrado")
    partner = await partner_service.update_partner(db, partner, data)
    return PartnerOut.model_validate(partner)


@router.delete(
    "/{partner_id}",
    response_model=PartnerOut,
    summary="Desactivar partner (baja lógica)",
    description="No borra el registro. Solo marca is_active = false para preservar historial.",
)
async def delete_partner(
    partner_id: UUID,
    db: DBSession,
    current_user: CurrentUser,
):
    partner = await partner_service.get_partner(db, current_user.company_id, partner_id)
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner no encontrado")
    if not partner.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El partner ya está desactivado")
    partner = await partner_service.soft_delete_partner(db, partner)
    return PartnerOut.model_validate(partner)


@router.post(
    "/{partner_id}/restore",
    response_model=PartnerOut,
    summary="Reactivar partner",
)
async def restore_partner(
    partner_id: UUID,
    db: DBSession,
    current_user: CurrentUser,
):
    partner = await partner_service.get_partner(db, current_user.company_id, partner_id)
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner no encontrado")
    if partner.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El partner ya está activo")
    partner = await partner_service.restore_partner(db, partner)
    return PartnerOut.model_validate(partner)
