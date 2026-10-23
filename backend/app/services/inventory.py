"""
Servicio de Inventario.

Reglas importantes:
- La cantidad de stock NUNCA se edita directo: siempre se genera un StockMove.
- reserved_qty se usa cuando haya pedidos confirmados (se integra después con ventas).
- Transfer = out en origen + in en destino (dos movimientos vinculados por notes/ref).
"""

from math import ceil
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Warehouse
from app.models.inventory import StockLevel, StockMove
from app.models.product import Product, ProductVariant
from app.schemas.inventory import StockLevelUpdate, StockMoveCreate


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

async def _get_or_create_stock_level(
    db: AsyncSession,
    company_id: UUID,
    warehouse_id: UUID,
    product_id: UUID,
    variant_id: Optional[UUID],
) -> StockLevel:
    q = select(StockLevel).where(
        StockLevel.company_id == company_id,
        StockLevel.warehouse_id == warehouse_id,
        StockLevel.product_id == product_id,
    )
    if variant_id:
        q = q.where(StockLevel.variant_id == variant_id)
    else:
        q = q.where(StockLevel.variant_id.is_(None))

    result = await db.execute(q)
    level = result.scalar_one_or_none()
    if level:
        return level

    level = StockLevel(
        company_id=company_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        variant_id=variant_id,
        quantity=0,
        reserved_qty=0,
        min_qty=0,
    )
    db.add(level)
    await db.flush()
    return level


async def _apply_quantity_change(
    db: AsyncSession,
    level: StockLevel,
    delta: float,
    allow_negative: bool = False,
) -> StockLevel:
    new_qty = float(level.quantity) + delta
    if not allow_negative and new_qty < 0:
        raise ValueError(
            f"Stock insuficiente. Disponible: {level.quantity}, se intentó restar: {abs(delta)}"
        )
    level.quantity = new_qty
    await db.flush()
    return level


def _to_stock_level_out(level: StockLevel) -> dict:
    qty = float(level.quantity)
    reserved = float(level.reserved_qty)
    min_q = float(level.min_qty)
    return {
        "id": level.id,
        "company_id": level.company_id,
        "warehouse_id": level.warehouse_id,
        "product_id": level.product_id,
        "variant_id": level.variant_id,
        "quantity": qty,
        "reserved_qty": reserved,
        "available_qty": qty - reserved,
        "min_qty": min_q,
        "max_qty": float(level.max_qty) if level.max_qty is not None else None,
        "is_low_stock": qty <= min_q,
    }


# ---------------------------------------------------------------------------
# Consultas de niveles
# ---------------------------------------------------------------------------

async def list_stock_levels(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    warehouse_id: Optional[UUID] = None,
    product_id: Optional[UUID] = None,
    low_stock_only: bool = False,
    search: Optional[str] = None,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 10000)

    base = select(StockLevel).where(StockLevel.company_id == company_id)

    if warehouse_id:
        base = base.where(StockLevel.warehouse_id == warehouse_id)
    if product_id:
        base = base.where(StockLevel.product_id == product_id)
    if low_stock_only:
        base = base.where(StockLevel.quantity <= StockLevel.min_qty)

    if search:
        term = f"%{search.strip()}%"
        # Join con productos para buscar por nombre/sku/marca/ean
        base = base.join(Product, Product.id == StockLevel.product_id).where(
            or_(
                Product.name.ilike(term),
                Product.sku.ilike(term),
                Product.barcode.ilike(term),
                Product.brand.ilike(term),
            )
        )

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(StockLevel.product_id).offset(offset).limit(page_size)
    )
    levels = result.scalars().all()

    # Enriquecer con datos de producto / almacén / categoría
    product_ids = {lv.product_id for lv in levels}
    warehouse_ids = {lv.warehouse_id for lv in levels}
    products_map: dict = {}
    warehouses_map: dict = {}
    categories_map: dict = {}
    if product_ids:
        from app.models.product import ProductCategory

        prows = (
            await db.execute(select(Product).where(Product.id.in_(product_ids)))
        ).scalars().all()
        products_map = {p.id: p for p in prows}
        cat_ids = {p.category_id for p in prows if p.category_id}
        if cat_ids:
            cats = (
                await db.execute(
                    select(ProductCategory).where(ProductCategory.id.in_(cat_ids))
                )
            ).scalars().all()
            categories_map = {c.id: c for c in cats}
    if warehouse_ids:
        from app.models.company import Warehouse

        wrows = (
            await db.execute(select(Warehouse).where(Warehouse.id.in_(warehouse_ids)))
        ).scalars().all()
        warehouses_map = {w.id: w for w in wrows}

    items = []
    for lv in levels:
        row = _to_stock_level_out(lv)
        prod = products_map.get(lv.product_id)
        wh = warehouses_map.get(lv.warehouse_id)
        if prod:
            row["product_name"] = prod.name
            row["product_sku"] = prod.sku
            row["product_barcode"] = prod.barcode
            row["product_brand"] = prod.brand
            row["unit"] = prod.unit
            cat = categories_map.get(prod.category_id) if prod.category_id else None
            row["category_name"] = cat.name if cat else None
        if wh:
            row["warehouse_name"] = wh.name
        items.append(row)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def get_stock_level(
    db: AsyncSession,
    company_id: UUID,
    level_id: UUID,
) -> Optional[dict]:
    result = await db.execute(
        select(StockLevel).where(
            StockLevel.id == level_id,
            StockLevel.company_id == company_id,
        )
    )
    level = result.scalar_one_or_none()
    return _to_stock_level_out(level) if level else None


async def update_stock_thresholds(
    db: AsyncSession,
    company_id: UUID,
    level_id: UUID,
    data: StockLevelUpdate,
) -> Optional[dict]:
    result = await db.execute(
        select(StockLevel).where(
            StockLevel.id == level_id,
            StockLevel.company_id == company_id,
        )
    )
    level = result.scalar_one_or_none()
    if not level:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(level, field, value)
    await db.flush()
    await db.refresh(level)
    return _to_stock_level_out(level)


# ---------------------------------------------------------------------------
# Movimientos
# ---------------------------------------------------------------------------

async def create_stock_move(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    data: StockMoveCreate,
) -> list[StockMove]:
    """
    Crea uno o dos movimientos (transfer = 2) y actualiza los niveles de stock.
    Devuelve la lista de movimientos generados.
    """
    # Validar almacén origen
    wh = await db.execute(
        select(Warehouse).where(
            Warehouse.id == data.warehouse_id,
            Warehouse.company_id == company_id,
            Warehouse.is_active == True,  # noqa: E712
        )
    )
    if not wh.scalar_one_or_none():
        raise ValueError("Almacén de origen no encontrado o inactivo")

    # Validar producto
    prod = await db.execute(
        select(Product).where(
            Product.id == data.product_id,
            Product.company_id == company_id,
            Product.is_active == True,  # noqa: E712
        )
    )
    product = prod.scalar_one_or_none()
    if not product:
        raise ValueError("Producto no encontrado o inactivo")
    if not product.track_stock:
        raise ValueError("Este producto no controla stock (track_stock=false)")

    moves: list[StockMove] = []

    if data.move_type == "in":
        level = await _get_or_create_stock_level(
            db, company_id, data.warehouse_id, data.product_id, data.variant_id
        )
        await _apply_quantity_change(db, level, data.quantity)
        move = StockMove(
            company_id=company_id,
            warehouse_id=data.warehouse_id,
            product_id=data.product_id,
            variant_id=data.variant_id,
            move_type="in",
            quantity=data.quantity,
            reference_type=data.reference_type or "manual",
            reference_id=data.reference_id,
            notes=data.notes,
            created_by=user_id,
        )
        db.add(move)
        moves.append(move)

    elif data.move_type == "out":
        level = await _get_or_create_stock_level(
            db, company_id, data.warehouse_id, data.product_id, data.variant_id
        )
        await _apply_quantity_change(db, level, -data.quantity)
        move = StockMove(
            company_id=company_id,
            warehouse_id=data.warehouse_id,
            product_id=data.product_id,
            variant_id=data.variant_id,
            move_type="out",
            quantity=data.quantity,
            reference_type=data.reference_type or "manual",
            reference_id=data.reference_id,
            notes=data.notes,
            created_by=user_id,
        )
        db.add(move)
        moves.append(move)

    elif data.move_type == "transfer":
        # Validar destino
        wh_to = await db.execute(
            select(Warehouse).where(
                Warehouse.id == data.warehouse_to_id,
                Warehouse.company_id == company_id,
                Warehouse.is_active == True,  # noqa: E712
            )
        )
        if not wh_to.scalar_one_or_none():
            raise ValueError("Almacén de destino no encontrado o inactivo")

        level_from = await _get_or_create_stock_level(
            db, company_id, data.warehouse_id, data.product_id, data.variant_id
        )
        await _apply_quantity_change(db, level_from, -data.quantity)

        level_to = await _get_or_create_stock_level(
            db, company_id, data.warehouse_to_id, data.product_id, data.variant_id
        )
        await _apply_quantity_change(db, level_to, data.quantity)

        note = data.notes or f"Transferencia a almacén {data.warehouse_to_id}"
        move_out = StockMove(
            company_id=company_id,
            warehouse_id=data.warehouse_id,
            product_id=data.product_id,
            variant_id=data.variant_id,
            move_type="transfer",
            quantity=data.quantity,
            reference_type=data.reference_type or "transfer",
            reference_id=data.reference_id,
            notes=f"[ORIGEN] {note}",
            created_by=user_id,
        )
        move_in = StockMove(
            company_id=company_id,
            warehouse_id=data.warehouse_to_id,
            product_id=data.product_id,
            variant_id=data.variant_id,
            move_type="transfer",
            quantity=data.quantity,
            reference_type=data.reference_type or "transfer",
            reference_id=data.reference_id,
            notes=f"[DESTINO] desde {data.warehouse_id}",
            created_by=user_id,
        )
        db.add(move_out)
        db.add(move_in)
        moves.extend([move_out, move_in])

    elif data.move_type == "adjustment":
        level = await _get_or_create_stock_level(
            db, company_id, data.warehouse_id, data.product_id, data.variant_id
        )
        current = float(level.quantity)
        target = float(data.quantity)
        delta = target - current
        if delta == 0:
            raise ValueError("El stock ya está en el valor indicado; no hay nada que ajustar")

        level.quantity = target
        await db.flush()

        move = StockMove(
            company_id=company_id,
            warehouse_id=data.warehouse_id,
            product_id=data.product_id,
            variant_id=data.variant_id,
            move_type="adjustment",
            quantity=abs(delta),  # guardamos el valor absoluto del cambio
            reference_type=data.reference_type or "adjustment",
            reference_id=data.reference_id,
            notes=(data.notes or "") + f" | Antes: {current} → Después: {target}",
            created_by=user_id,
        )
        db.add(move)
        moves.append(move)

    await db.flush()
    for m in moves:
        await db.refresh(m)
    return moves


async def list_stock_moves(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    warehouse_id: Optional[UUID] = None,
    product_id: Optional[UUID] = None,
    move_type: Optional[str] = None,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = select(StockMove).where(StockMove.company_id == company_id)

    if warehouse_id:
        base = base.where(StockMove.warehouse_id == warehouse_id)
    if product_id:
        base = base.where(StockMove.product_id == product_id)
    if move_type:
        base = base.where(StockMove.move_type == move_type)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(StockMove.created_at.desc()).offset(offset).limit(page_size)
    )
    items = result.scalars().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


# ---------------------------------------------------------------------------
# Resumen y alertas
# ---------------------------------------------------------------------------

async def get_stock_summary(db: AsyncSession, company_id: UUID) -> dict:
    # Productos que controlan stock
    tracked_q = await db.execute(
        select(func.count()).where(
            Product.company_id == company_id,
            Product.track_stock == True,  # noqa: E712
            Product.is_active == True,  # noqa: E712
        )
    )
    total_tracked = tracked_q.scalar() or 0

    wh_q = await db.execute(
        select(func.count()).where(
            Warehouse.company_id == company_id,
            Warehouse.is_active == True,  # noqa: E712
        )
    )
    total_warehouses = wh_q.scalar() or 0

    # Low stock
    low_q = (
        select(
            StockLevel,
            Product.name.label("product_name"),
            Warehouse.name.label("warehouse_name"),
            ProductVariant.name.label("variant_name"),
        )
        .join(Product, Product.id == StockLevel.product_id)
        .join(Warehouse, Warehouse.id == StockLevel.warehouse_id)
        .outerjoin(ProductVariant, ProductVariant.id == StockLevel.variant_id)
        .where(
            StockLevel.company_id == company_id,
            StockLevel.quantity <= StockLevel.min_qty,
        )
        .order_by(StockLevel.quantity)
        .limit(50)
    )
    low_result = await db.execute(low_q)
    low_rows = low_result.all()

    low_items = []
    for row in low_rows:
        level = row[0]
        qty = float(level.quantity)
        min_q = float(level.min_qty)
        low_items.append(
            {
                "product_id": level.product_id,
                "product_name": row.product_name,
                "variant_id": level.variant_id,
                "variant_name": row.variant_name,
                "warehouse_id": level.warehouse_id,
                "warehouse_name": row.warehouse_name,
                "quantity": qty,
                "min_qty": min_q,
                "missing": max(0, min_q - qty),
            }
        )

    zero_q = await db.execute(
        select(func.count()).where(
            StockLevel.company_id == company_id,
            StockLevel.quantity <= 0,
        )
    )
    zero_count = zero_q.scalar() or 0

    return {
        "total_products_tracked": total_tracked,
        "total_warehouses": total_warehouses,
        "low_stock_count": len(low_items),
        "zero_stock_count": zero_count,
        "low_stock_items": low_items,
    }
