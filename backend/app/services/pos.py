"""
Servicio de Punto de Venta (POS).

Una venta POS en un solo paso:
  1. Valida sesión de caja abierta
  2. Resuelve precios (lista default si no se indica unit_price)
  3. Crea SaleOrder confirmado + descuenta stock
  4. Crea Invoice posted
  5. Registra Payment(s)
  6. Si hay pago en efectivo → CashMovement en la sesión
"""

from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Warehouse
from app.models.inventory import StockLevel
from app.models.partner import Partner
from app.models.product import PriceList, PriceListItem, Product, ProductVariant
from app.models.sales import Invoice, InvoiceLine, Payment, SaleOrder, SaleOrderLine
from app.models.treasury import CashMovement, CashSession
from app.schemas.pos import POSLineCreate, POSSaleCreate
from app.services.inventory import _apply_quantity_change, _get_or_create_stock_level
from app.services.sales import _line_subtotal, _next_number


async def _get_open_session(
    db: AsyncSession, company_id: UUID, session_id: UUID
) -> CashSession:
    result = await db.execute(
        select(CashSession).where(
            CashSession.id == session_id,
            CashSession.company_id == company_id,
            CashSession.status == "open",
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise ValueError("Sesión de caja no encontrada o ya cerrada")
    return session


async def _get_or_create_final_consumer(
    db: AsyncSession, company_id: UUID
) -> Partner:
    result = await db.execute(
        select(Partner).where(
            Partner.company_id == company_id,
            Partner.name == "Consumidor Final",
            Partner.partner_type.in_(["customer", "both"]),
        )
    )
    partner = result.scalar_one_or_none()
    if partner:
        return partner
    partner = Partner(
        company_id=company_id,
        partner_type="customer",
        name="Consumidor Final",
        notes="Cliente genérico para ventas POS",
    )
    db.add(partner)
    await db.flush()
    return partner


async def _resolve_warehouse(
    db: AsyncSession, company_id: UUID, warehouse_id: Optional[UUID]
) -> UUID:
    if warehouse_id:
        result = await db.execute(
            select(Warehouse).where(
                Warehouse.id == warehouse_id,
                Warehouse.company_id == company_id,
                Warehouse.is_active == True,  # noqa: E712
            )
        )
        if not result.scalar_one_or_none():
            raise ValueError("Almacén no encontrado o inactivo")
        return warehouse_id

    result = await db.execute(
        select(Warehouse).where(
            Warehouse.company_id == company_id,
            Warehouse.is_main == True,  # noqa: E712
            Warehouse.is_active == True,  # noqa: E712
        )
    )
    wh = result.scalar_one_or_none()
    if not wh:
        result = await db.execute(
            select(Warehouse).where(
                Warehouse.company_id == company_id,
                Warehouse.is_active == True,  # noqa: E712
            ).limit(1)
        )
        wh = result.scalar_one_or_none()
    if not wh:
        raise ValueError("No hay almacén activo")
    return wh.id


async def _get_default_price(
    db: AsyncSession, company_id: UUID, product_id: UUID, variant_id: Optional[UUID]
) -> Optional[float]:
    # Lista default
    pl_q = await db.execute(
        select(PriceList).where(
            PriceList.company_id == company_id,
            PriceList.is_default == True,  # noqa: E712
            PriceList.is_active == True,  # noqa: E712
        )
    )
    pl = pl_q.scalar_one_or_none()
    if not pl:
        pl_q = await db.execute(
            select(PriceList).where(
                PriceList.company_id == company_id,
                PriceList.is_active == True,  # noqa: E712
            ).limit(1)
        )
        pl = pl_q.scalar_one_or_none()
    if not pl:
        return None

    item_q = select(PriceListItem).where(
        PriceListItem.price_list_id == pl.id,
        PriceListItem.product_id == product_id,
    )
    if variant_id:
        item_q = item_q.where(PriceListItem.variant_id == variant_id)
    else:
        item_q = item_q.where(PriceListItem.variant_id.is_(None))

    result = await db.execute(item_q.order_by(PriceListItem.min_qty).limit(1))
    item = result.scalar_one_or_none()
    return float(item.price) if item else None


async def create_pos_sale(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    data: POSSaleCreate,
) -> dict:
    # 1. Sesión de caja
    session = await _get_open_session(db, company_id, data.session_id)

    # 2. Cliente
    if data.partner_id:
        result = await db.execute(
            select(Partner).where(
                Partner.id == data.partner_id,
                Partner.company_id == company_id,
                Partner.is_active == True,  # noqa: E712
            )
        )
        partner = result.scalar_one_or_none()
        if not partner:
            raise ValueError("Cliente no encontrado o inactivo")
    else:
        partner = await _get_or_create_final_consumer(db, company_id)

    # 3. Almacén
    warehouse_id = await _resolve_warehouse(db, company_id, data.warehouse_id)

    # 4. Resolver líneas y precios
    lines_data = []
    for ln in data.lines:
        result = await db.execute(
            select(Product).where(
                Product.id == ln.product_id,
                Product.company_id == company_id,
                Product.is_active == True,  # noqa: E712
            )
        )
        product = result.scalar_one_or_none()
        if not product:
            raise ValueError(f"Producto {ln.product_id} no encontrado o inactivo")

        unit_price = ln.unit_price
        if unit_price is None:
            unit_price = await _get_default_price(
                db, company_id, ln.product_id, ln.variant_id
            )
            if unit_price is None:
                raise ValueError(
                    f"No hay precio definido para el producto '{product.name}'. "
                    "Indicá unit_price o cargá una lista de precios."
                )

        # Validar stock si aplica
        if product.track_stock:
            level = await _get_or_create_stock_level(
                db, company_id, warehouse_id, ln.product_id, ln.variant_id
            )
            available = float(level.quantity) - float(level.reserved_qty)
            if available < ln.quantity:
                raise ValueError(
                    f"Stock insuficiente de '{product.name}'. "
                    f"Disponible: {available}, solicitado: {ln.quantity}"
                )

        st = _line_subtotal(ln.quantity, unit_price, ln.discount_pct)
        lines_data.append({
            "product_id": ln.product_id,
            "variant_id": ln.variant_id,
            "description": ln.description or product.name,
            "quantity": ln.quantity,
            "unit_price": unit_price,
            "discount_pct": ln.discount_pct,
            "tax_rate": ln.tax_rate,
            "subtotal": st,
            "track_stock": product.track_stock,
        })

    # Totales
    subtotal = round(sum(ld["subtotal"] for ld in lines_data), 2)
    if data.discount_global_pct:
        subtotal = round(subtotal * (1 - data.discount_global_pct / 100), 2)

    tax_amount = round(
        sum(
            round(
                ld["subtotal"]
                * (1 - data.discount_global_pct / 100)
                * ld["tax_rate"]
                / 100,
                2,
            )
            for ld in lines_data
        ),
        2,
    )
    total = round(subtotal + tax_amount, 2)

    total_paid = round(sum(p.amount for p in data.payments), 2)
    if total_paid < total - 0.01:
        raise ValueError(
            f"El pago ({total_paid}) es menor al total ({total}). Falta {round(total - total_paid, 2)}"
        )
    change = round(max(0, total_paid - total), 2)

    # 5. SaleOrder confirmado
    order_number = await _next_number(db, company_id, "POS", SaleOrder, "order_number")
    order = SaleOrder(
        company_id=company_id,
        partner_id=partner.id,
        order_number=order_number,
        order_type="order",
        status="confirmed",
        order_date=date.today(),
        currency_code=None,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        notes=data.notes or "Venta POS",
        salesperson_id=user_id,
        created_by=user_id,
    )
    db.add(order)
    await db.flush()

    for ld in lines_data:
        db.add(
            SaleOrderLine(
                order_id=order.id,
                product_id=ld["product_id"],
                variant_id=ld["variant_id"],
                description=ld["description"],
                quantity=ld["quantity"],
                unit_price=ld["unit_price"],
                discount_pct=ld["discount_pct"],
                tax_rate=ld["tax_rate"],
                subtotal=ld["subtotal"],
            )
        )

    # 6. Descontar stock
    from app.models.inventory import StockMove

    for ld in lines_data:
        if not ld["track_stock"]:
            continue
        level = await _get_or_create_stock_level(
            db, company_id, warehouse_id, ld["product_id"], ld["variant_id"]
        )
        await _apply_quantity_change(db, level, -ld["quantity"])
        db.add(
            StockMove(
                company_id=company_id,
                warehouse_id=warehouse_id,
                product_id=ld["product_id"],
                variant_id=ld["variant_id"],
                move_type="out",
                quantity=ld["quantity"],
                reference_type="pos_sale",
                reference_id=order.id,
                notes=f"POS {order_number}",
                created_by=user_id,
            )
        )

    # 7. Factura posted
    invoice_number = await _next_number(db, company_id, "FAC", Invoice, "invoice_number")
    inv = Invoice(
        company_id=company_id,
        partner_id=partner.id,
        sale_order_id=order.id,
        invoice_number=invoice_number,
        invoice_type="invoice",
        status="posted",
        invoice_date=date.today(),
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        amount_paid=0,
        notes=f"Factura POS {order_number}",
        created_by=user_id,
    )
    db.add(inv)
    await db.flush()

    for ld in lines_data:
        db.add(
            InvoiceLine(
                invoice_id=inv.id,
                product_id=ld["product_id"],
                description=ld["description"],
                quantity=ld["quantity"],
                unit_price=ld["unit_price"],
                discount_pct=ld["discount_pct"],
                tax_rate=ld["tax_rate"],
                subtotal=ld["subtotal"],
            )
        )

    # 8. Pagos + movimientos de caja
    payments_out = []
    amount_applied = 0.0
    for p in data.payments:
        # Solo aplicar hasta el total (el resto es vuelto en efectivo)
        apply = p.amount
        if p.payment_method == "cash" and total_paid > total:
            # El exceso de efectivo es vuelto; solo registramos lo que cubre
            remaining_to_cover = total - amount_applied
            if remaining_to_cover <= 0:
                apply = 0
            else:
                apply = min(p.amount, remaining_to_cover)

        if apply > 0:
            payment = Payment(
                company_id=company_id,
                partner_id=partner.id,
                invoice_id=inv.id,
                amount=apply,
                payment_date=date.today(),
                payment_method=p.payment_method,
                reference=p.reference,
                notes="Pago POS",
                created_by=user_id,
            )
            db.add(payment)
            amount_applied += apply
            await db.flush()

            if p.payment_method == "cash":
                db.add(
                    CashMovement(
                        company_id=company_id,
                        session_id=session.id,
                        movement_type="sale_payment",
                        direction="income",
                        amount=apply,
                        payment_method="cash",
                        reference_type="payment",
                        reference_id=payment.id,
                        description=f"Cobro POS {order_number}",
                        created_by=user_id,
                    )
                )

        payments_out.append({
            "payment_method": p.payment_method,
            "amount": p.amount,
            "reference": p.reference,
        })

    inv.amount_paid = min(amount_applied, total)
    if float(inv.amount_paid) >= float(inv.total) - 0.01:
        inv.status = "paid"

    order.status = "done"
    await db.flush()

    return {
        "sale_order_id": order.id,
        "invoice_id": inv.id,
        "order_number": order_number,
        "invoice_number": invoice_number,
        "partner_id": partner.id,
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "total": total,
        "amount_paid": float(inv.amount_paid),
        "change": change,
        "lines": [
            {
                "product_id": ld["product_id"],
                "variant_id": ld["variant_id"],
                "description": ld["description"],
                "quantity": ld["quantity"],
                "unit_price": ld["unit_price"],
                "discount_pct": ld["discount_pct"],
                "tax_rate": ld["tax_rate"],
                "subtotal": ld["subtotal"],
            }
            for ld in lines_data
        ],
        "payments": payments_out,
        "session_id": session.id,
        "created_at": datetime.now(timezone.utc),
        "message": f"Venta POS {order_number} registrada. Factura {invoice_number}."
        + (f" Vuelto: {change}" if change > 0 else ""),
    }


async def search_products_for_pos(
    db: AsyncSession,
    company_id: UUID,
    *,
    q: Optional[str] = None,
    warehouse_id: Optional[UUID] = None,
    limit: int = 20,
) -> dict:
    """Búsqueda rápida de productos con precio y stock para el POS."""
    limit = min(max(1, limit), 50)

    base = select(Product).where(
        Product.company_id == company_id,
        Product.is_active == True,  # noqa: E712
    )
    if q:
        term = f"%{q.strip()}%"
        base = base.where(
            or_(
                Product.name.ilike(term),
                Product.sku.ilike(term),
                Product.barcode.ilike(term),
            )
        )

    result = await db.execute(
        base.options(selectinload(Product.variants)).order_by(Product.name).limit(limit)
    )
    products = result.scalars().unique().all()

    # Precio default
    pl_q = await db.execute(
        select(PriceList).where(
            PriceList.company_id == company_id,
            PriceList.is_default == True,  # noqa: E712
            PriceList.is_active == True,  # noqa: E712
        )
    )
    pl = pl_q.scalar_one_or_none()

    price_map: dict = {}
    if pl:
        items_q = await db.execute(
            select(PriceListItem).where(PriceListItem.price_list_id == pl.id)
        )
        for item in items_q.scalars().all():
            key = (item.product_id, item.variant_id)
            if key not in price_map:
                price_map[key] = float(item.price)

    # Stock
    stock_map: dict = {}
    if warehouse_id:
        stock_q = await db.execute(
            select(StockLevel).where(
                StockLevel.company_id == company_id,
                StockLevel.warehouse_id == warehouse_id,
            )
        )
        for lv in stock_q.scalars().all():
            stock_map[(lv.product_id, lv.variant_id)] = float(lv.quantity) - float(lv.reserved_qty)

    items = []
    for p in products:
        price = price_map.get((p.id, None))
        stock = stock_map.get((p.id, None)) if p.track_stock else None
        variants = []
        for v in p.variants:
            if not v.is_active:
                continue
            variants.append({
                "id": str(v.id),
                "name": v.name,
                "sku": v.sku,
                "barcode": v.barcode,
                "unit_price": price_map.get((p.id, v.id), price),
                "stock_available": stock_map.get((p.id, v.id)) if p.track_stock else None,
            })
        items.append({
            "id": p.id,
            "name": p.name,
            "sku": p.sku,
            "barcode": p.barcode,
            "unit_price": price,
            "stock_available": stock,
            "track_stock": p.track_stock,
            "product_type": p.product_type,
            "variants": variants,
        })

    return {"items": items, "total": len(items)}
