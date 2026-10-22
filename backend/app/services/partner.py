"""
Servicio de Partners (Clientes / Proveedores).
Todas las operaciones están filtradas por company_id del usuario actual.
"""

from math import ceil
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.partner import Partner
from app.schemas.partner import PartnerCreate, PartnerUpdate


async def list_partners(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    partner_type: Optional[str] = None,
    is_active: Optional[bool] = True,
    tags: Optional[list[str]] = None,
) -> dict:
    """
    Lista partners con paginación, búsqueda y filtros.
    Por defecto solo muestra activos.
    """
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = select(Partner).where(Partner.company_id == company_id)

    if is_active is not None:
        base = base.where(Partner.is_active == is_active)

    if partner_type:
        # "customer" también trae los de tipo "both"
        if partner_type == "customer":
            base = base.where(Partner.partner_type.in_(["customer", "both"]))
        elif partner_type == "supplier":
            base = base.where(Partner.partner_type.in_(["supplier", "both"]))
        else:
            base = base.where(Partner.partner_type == partner_type)

    if search:
        term = f"%{search.strip()}%"
        base = base.where(
            or_(
                Partner.name.ilike(term),
                Partner.legal_name.ilike(term),
                Partner.tax_id.ilike(term),
                Partner.email.ilike(term),
                Partner.phone.ilike(term),
                Partner.city.ilike(term),
            )
        )

    if tags:
        # PostgreSQL ARRAY: el partner debe contener al menos uno de los tags
        base = base.where(Partner.tags.overlap(tags))

    # Total
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Página
    offset = (page - 1) * page_size
    items_q = base.order_by(Partner.name).offset(offset).limit(page_size)
    result = await db.execute(items_q)
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def get_partner(
    db: AsyncSession,
    company_id: UUID,
    partner_id: UUID,
) -> Optional[Partner]:
    result = await db.execute(
        select(Partner).where(
            Partner.id == partner_id,
            Partner.company_id == company_id,
        )
    )
    return result.scalar_one_or_none()


async def create_partner(
    db: AsyncSession,
    company_id: UUID,
    data: PartnerCreate,
) -> Partner:
    partner = Partner(
        company_id=company_id,
        **data.model_dump(),
    )
    db.add(partner)
    await db.flush()
    await db.refresh(partner)
    return partner


async def update_partner(
    db: AsyncSession,
    partner: Partner,
    data: PartnerUpdate,
) -> Partner:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(partner, field, value)
    await db.flush()
    await db.refresh(partner)
    return partner


async def soft_delete_partner(
    db: AsyncSession,
    partner: Partner,
) -> Partner:
    """Baja lógica: marca is_active = False."""
    partner.is_active = False
    await db.flush()
    await db.refresh(partner)
    return partner


async def restore_partner(
    db: AsyncSession,
    partner: Partner,
) -> Partner:
    partner.is_active = True
    await db.flush()
    await db.refresh(partner)
    return partner
