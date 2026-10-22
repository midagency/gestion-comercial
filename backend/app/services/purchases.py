"""
Servicio de Compras.

Flujo:
  draft → confirmed → (recepciones parciales) → received
  confirmed/partial → cancelled

Al recibir mercadería se genera StockMove tipo "in".
"""

from datetime import date
from math import ceil
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Warehouse
from app.models.inventory import StockMove
from app.models.partner import Partner
from app.models.product import Product
from app.models.purchases import (
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierInvoice,
    SupplierInvoiceLine,
)
from app.schemas.purchases import (
    PurchaseOrderCreate,
    PurchaseOrderUpdate,
    ReceiveGoodsRequest,
    SupplierInvoiceCreate,
    SupplierInvoiceFromOrder,
    SupplierPaymentCreate,
)
from app.services.inventory import _apply_quantity_change, _get_or_create_stock_level


def _line_subtotal(qty: float, price: float, discount_pct: float) -> float:
    return round(qty * price * (1 - discount_pct / 100), 2)


def _calc_totals(lines_data: list) -> tuple[float, float, float]:
    subtotal = 0.0
    tax = 0.0
    for ln in lines_data:
        st = _line_subtotal(ln["quantity"], ln["unit_price"], ln["discount_pct"])
        subtotal += st
        tax += round(st * ln["tax_rate"] / 100, 2)
    return round(subtotal, 2), round(tax, 2), round(subtotal + tax, 2)


async def _next_number(db: AsyncSession, company_id: UUID, prefix: str, model) -> str:
    result = await db.execute(
        select(func.count()).where(model.company_id == company_id)
    )
    count = (result.scalar() or 0) + 1
    return f"{prefix}-{count:05d}"


async def _validate_supplier(db: AsyncSession, company_id: UUID, partner_id: UUID) -> Partner:
    result = await db.execute(
        select(Partner).where(
            Partner.id == partner_id,
            Partner.company_id == company_id,
            Partner.is_active == True,  # noqa: E712
            Partner.partner_type.in_(["supplier", "both"]),
        )
    )
    partner = result.scalar_one_or_none()
    if not partner:
        raise ValueError("Proveedor no encontrado, inactivo o no es de tipo supplier/both")
    return partner


async def _validate_product(db: AsyncSession, company_id: UUID, product_id: UUID) -> Product:
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.company_id == company_id,
            Product.is_active == True,  # noqa: E712
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise ValueError(f"Producto {product_id} no encontrado o inactivo")
    return product


def _line_out(line: PurchaseOrderLine) -> dict:
    qty = float(line.quantity)
    recv = float(line.qty_received)
    return {
        "id": line.id,
        "product_id": line.product_id,
        "variant_id": line.variant_id,
        "description": line.description,
        "quantity": qty,
        "qty_received": recv,
        "qty_pending": max(0, qty - recv),
        "unit_price": float(line.unit_price),
        "discount_pct": float(line.discount_pct),
        "tax_rate": float(line.tax_rate),
        "subtotal": float(line.subtotal),
    }


def _order_out(order: PurchaseOrder) -> dict:
    return {
        "id": order.id,
        "company_id": order.company_id,
        "partner_id": order.partner_id,
        "warehouse_id": order.warehouse_id,
        "order_number": order.order_number,
        "status": order.status,
        "order_date": order.order_date,
        "expected_date": order.expected_date,
        "currency_code": order.currency_code,
        "subtotal": float(order.subtotal),
        "tax_amount": float(order.tax_amount),
        "total": float(order.total),
        "notes": order.notes,
        "created_by": order.created_by,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "lines": [_line_out(ln) for ln in order.lines],
    }


def _invoice_out(inv: SupplierInvoice) -> dict:
    return {
        "id": inv.id,
        "company_id": inv.company_id,
        "partner_id": inv.partner_id,
        "purchase_order_id": inv.purchase_order_id,
        "invoice_number": inv.invoice_number,
        "supplier_ref": inv.supplier_ref,
        "status": inv.status,
        "invoice_date": inv.invoice_date,
        "due_date": inv.due_date,
        "currency_code": inv.currency_code,
        "subtotal": float(inv.subtotal),
        "tax_amount": float(inv.tax_amount),
        "total": float(inv.total),
        "amount_paid": float(inv.amount_paid),
        "amount_due": float(inv.total) - float(inv.amount_paid),
        "notes": inv.notes,
        "created_by": inv.created_by,
        "created_at": inv.created_at,
        "lines": inv.lines,
    }


# ===========================================================================
# ÓRDENES DE COMPRA
# ===========================================================================

async def list_orders(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    partner_id: Optional[UUID] = None,
    search: Optional[str] = None,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = (
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.company_id == company_id)
    )
    if status:
        base = base.where(PurchaseOrder.status == status)
    if partner_id:
        base = base.where(PurchaseOrder.partner_id == partner_id)
    if search:
        term = f"%{search.strip()}%"
        base = base.where(PurchaseOrder.order_number.ilike(term))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(PurchaseOrder.created_at.desc()).offset(offset).limit(page_size)
    )
    items = result.scalars().unique().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def get_order(
    db: AsyncSession, company_id: UUID, order_id: UUID
) -> Optional[PurchaseOrder]:
    result = await db.execute(
        select(PurchaseOrder)
        .options(selectinload(PurchaseOrder.lines))
        .where(PurchaseOrder.id == order_id, PurchaseOrder.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_order(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: PurchaseOrderCreate
) -> PurchaseOrder:
    await _validate_supplier(db, company_id, data.partner_id)

    if data.warehouse_id:
        wh = await db.execute(
            select(Warehouse).where(
                Warehouse.id == data.warehouse_id,
                Warehouse.company_id == company_id,
            )
        )
        if not wh.scalar_one_or_none():
            raise ValueError("Almacén no encontrado")

    lines_data = []
    for ln in data.lines:
        await _validate_product(db, company_id, ln.product_id)
        st = _line_subtotal(ln.quantity, ln.unit_price, ln.discount_pct)
        lines_data.append({**ln.model_dump(), "subtotal": st})

    subtotal, tax_amount, total = _calc_totals(lines_data)
    order_number = await _next_number(db, company_id, "OC", PurchaseOrder)

    order = PurchaseOrder(
        company_id=company_id,
        partner_id=data.partner_id,
        warehouse_id=data.warehouse_id,
        order_number=order_number,
        status="draft",
        order_date=data.order_date or date.today(),
        expected_date=data.expected_date,
        currency_code=data.currency_code,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(order)
    await db.flush()

    for ld in lines_data:
        db.add(
            PurchaseOrderLine(
                order_id=order.id,
                product_id=ld["product_id"],
                variant_id=ld.get("variant_id"),
                description=ld.get("description"),
                quantity=ld["quantity"],
                qty_received=0,
                unit_price=ld["unit_price"],
                discount_pct=ld["discount_pct"],
                tax_rate=ld["tax_rate"],
                subtotal=ld["subtotal"],
            )
        )

    await db.flush()
    await db.refresh(order, attribute_names=["lines"])
    return order


async def update_order(
    db: AsyncSession, order: PurchaseOrder, data: PurchaseOrderUpdate
) -> PurchaseOrder:
    if order.status != "draft":
        raise ValueError("Solo se pueden editar órdenes en estado draft")

    updates = data.model_dump(exclude_unset=True, exclude={"lines"})
    if "partner_id" in updates:
        await _validate_supplier(db, order.company_id, updates["partner_id"])

    for field, value in updates.items():
        setattr(order, field, value)

    if data.lines is not None:
        for old in list(order.lines):
            await db.delete(old)
        await db.flush()

        lines_data = []
        for ln in data.lines:
            await _validate_product(db, order.company_id, ln.product_id)
            st = _line_subtotal(ln.quantity, ln.unit_price, ln.discount_pct)
            lines_data.append({**ln.model_dump(), "subtotal": st})
            db.add(
                PurchaseOrderLine(
                    order_id=order.id,
                    product_id=ln.product_id,
                    variant_id=ln.variant_id,
                    description=ln.description,
                    quantity=ln.quantity,
                    qty_received=0,
                    unit_price=ln.unit_price,
                    discount_pct=ln.discount_pct,
                    tax_rate=ln.tax_rate,
                    subtotal=st,
                )
            )
        subtotal, tax_amount, total = _calc_totals(lines_data)
        order.subtotal = subtotal
        order.tax_amount = tax_amount
        order.total = total

    await db.flush()
    await db.refresh(order, attribute_names=["lines"])
    return order


async def confirm_order(db: AsyncSession, order: PurchaseOrder) -> PurchaseOrder:
    if order.status != "draft":
        raise ValueError("Solo se pueden confirmar órdenes en estado draft")
    order.status = "confirmed"
    await db.flush()
    await db.refresh(order, attribute_names=["lines"])
    return order


async def cancel_order(db: AsyncSession, order: PurchaseOrder) -> PurchaseOrder:
    if order.status in ("received", "cancelled"):
        raise ValueError(f"No se puede cancelar una orden en estado {order.status}")
    # Si ya hubo recepciones parciales, no permitimos cancelar
    if any(float(ln.qty_received) > 0 for ln in order.lines):
        raise ValueError(
            "La orden tiene mercadería recibida. No se puede cancelar; "
            "recibí el resto o ajustá manualmente el stock."
        )
    order.status = "cancelled"
    await db.flush()
    await db.refresh(order, attribute_names=["lines"])
    return order


async def receive_goods(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    order: PurchaseOrder,
    data: ReceiveGoodsRequest,
) -> PurchaseOrder:
    """
    Recepción total o parcial.
    Actualiza qty_received de cada línea y genera StockMove 'in'.
    """
    if order.status not in ("confirmed", "partial"):
        raise ValueError("Solo se puede recibir mercadería de órdenes confirmed o partial")

    # Resolver almacén
    warehouse_id = data.warehouse_id or order.warehouse_id
    if not warehouse_id:
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
            raise ValueError("No hay almacén activo para recibir mercadería")
        warehouse_id = wh.id
    else:
        wh_check = await db.execute(
            select(Warehouse).where(
                Warehouse.id == warehouse_id,
                Warehouse.company_id == company_id,
                Warehouse.is_active == True,  # noqa: E712
            )
        )
        if not wh_check.scalar_one_or_none():
            raise ValueError("Almacén no encontrado o inactivo")

    lines_by_id = {ln.id: ln for ln in order.lines}

    for receipt in data.lines:
        line = lines_by_id.get(receipt.line_id)
        if not line:
            raise ValueError(f"Línea {receipt.line_id} no pertenece a esta orden")

        pending = float(line.quantity) - float(line.qty_received)
        if receipt.quantity > pending + 1e-9:
            raise ValueError(
                f"Cantidad a recibir ({receipt.quantity}) supera lo pendiente ({pending}) "
                f"en la línea {receipt.line_id}"
            )

        product = await _validate_product(db, company_id, line.product_id)

        line.qty_received = float(line.qty_received) + receipt.quantity

        if product.track_stock:
            level = await _get_or_create_stock_level(
                db, company_id, warehouse_id, line.product_id, line.variant_id
            )
            await _apply_quantity_change(db, level, receipt.quantity)
            move = StockMove(
                company_id=company_id,
                warehouse_id=warehouse_id,
                product_id=line.product_id,
                variant_id=line.variant_id,
                move_type="in",
                quantity=receipt.quantity,
                reference_type="purchase_order",
                reference_id=order.id,
                notes=data.notes or f"Recepción OC {order.order_number}",
                created_by=user_id,
            )
            db.add(move)

    # Actualizar estado de la orden
    all_received = all(
        float(ln.qty_received) >= float(ln.quantity) - 1e-9 for ln in order.lines
    )
    any_received = any(float(ln.qty_received) > 0 for ln in order.lines)

    if all_received:
        order.status = "received"
    elif any_received:
        order.status = "partial"

    await db.flush()
    await db.refresh(order, attribute_names=["lines"])
    return order


# ===========================================================================
# FACTURAS DE PROVEEDOR
# ===========================================================================

async def list_supplier_invoices(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    partner_id: Optional[UUID] = None,
    search: Optional[str] = None,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = (
        select(SupplierInvoice)
        .options(selectinload(SupplierInvoice.lines))
        .where(SupplierInvoice.company_id == company_id)
    )
    if status:
        base = base.where(SupplierInvoice.status == status)
    if partner_id:
        base = base.where(SupplierInvoice.partner_id == partner_id)
    if search:
        term = f"%{search.strip()}%"
        base = base.where(
            (SupplierInvoice.invoice_number.ilike(term))
            | (SupplierInvoice.supplier_ref.ilike(term))
        )

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(SupplierInvoice.created_at.desc()).offset(offset).limit(page_size)
    )
    items = result.scalars().unique().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def get_supplier_invoice(
    db: AsyncSession, company_id: UUID, invoice_id: UUID
) -> Optional[SupplierInvoice]:
    result = await db.execute(
        select(SupplierInvoice)
        .options(selectinload(SupplierInvoice.lines))
        .where(SupplierInvoice.id == invoice_id, SupplierInvoice.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_supplier_invoice(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: SupplierInvoiceCreate
) -> SupplierInvoice:
    await _validate_supplier(db, company_id, data.partner_id)

    lines_data = []
    for ln in data.lines:
        if ln.product_id:
            await _validate_product(db, company_id, ln.product_id)
        st = _line_subtotal(ln.quantity, ln.unit_price, ln.discount_pct)
        lines_data.append({**ln.model_dump(), "subtotal": st})

    subtotal, tax_amount, total = _calc_totals(lines_data)
    invoice_number = await _next_number(db, company_id, "FC", SupplierInvoice)

    inv = SupplierInvoice(
        company_id=company_id,
        partner_id=data.partner_id,
        purchase_order_id=data.purchase_order_id,
        invoice_number=invoice_number,
        supplier_ref=data.supplier_ref,
        status="draft",
        invoice_date=data.invoice_date or date.today(),
        due_date=data.due_date,
        currency_code=data.currency_code,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        amount_paid=0,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(inv)
    await db.flush()

    for ld in lines_data:
        db.add(
            SupplierInvoiceLine(
                invoice_id=inv.id,
                product_id=ld.get("product_id"),
                description=ld["description"],
                quantity=ld["quantity"],
                unit_price=ld["unit_price"],
                discount_pct=ld["discount_pct"],
                tax_rate=ld["tax_rate"],
                subtotal=ld["subtotal"],
            )
        )

    await db.flush()
    await db.refresh(inv, attribute_names=["lines"])
    return inv


async def create_supplier_invoice_from_order(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    order: PurchaseOrder,
    data: SupplierInvoiceFromOrder,
) -> SupplierInvoice:
    if order.status not in ("confirmed", "partial", "received"):
        raise ValueError("Solo se puede facturar una OC confirmada, parcial o recibida")

    inv_lines = []
    for ln in order.lines:
        inv_lines.append({
            "product_id": ln.product_id,
            "description": ln.description or "",
            "quantity": float(ln.quantity),
            "unit_price": float(ln.unit_price),
            "discount_pct": float(ln.discount_pct),
            "tax_rate": float(ln.tax_rate),
            "subtotal": float(ln.subtotal),
        })

    invoice_number = await _next_number(db, company_id, "FC", SupplierInvoice)

    inv = SupplierInvoice(
        company_id=company_id,
        partner_id=order.partner_id,
        purchase_order_id=order.id,
        invoice_number=invoice_number,
        supplier_ref=data.supplier_ref,
        status="draft",
        invoice_date=data.invoice_date or date.today(),
        due_date=data.due_date,
        currency_code=order.currency_code,
        subtotal=float(order.subtotal),
        tax_amount=float(order.tax_amount),
        total=float(order.total),
        amount_paid=0,
        notes=data.notes or f"Factura generada desde OC {order.order_number}",
        created_by=user_id,
    )
    db.add(inv)
    await db.flush()

    for ld in inv_lines:
        db.add(
            SupplierInvoiceLine(
                invoice_id=inv.id,
                product_id=ld["product_id"],
                description=ld["description"] or f"Ítem OC {order.order_number}",
                quantity=ld["quantity"],
                unit_price=ld["unit_price"],
                discount_pct=ld["discount_pct"],
                tax_rate=ld["tax_rate"],
                subtotal=ld["subtotal"],
            )
        )

    await db.flush()
    await db.refresh(inv, attribute_names=["lines"])
    return inv


async def post_supplier_invoice(db: AsyncSession, invoice: SupplierInvoice) -> SupplierInvoice:
    if invoice.status != "draft":
        raise ValueError("Solo se pueden contabilizar facturas en estado draft")
    invoice.status = "posted"
    await db.flush()
    await db.refresh(invoice, attribute_names=["lines"])
    return invoice


async def cancel_supplier_invoice(db: AsyncSession, invoice: SupplierInvoice) -> SupplierInvoice:
    if invoice.status == "paid":
        raise ValueError("No se puede cancelar una factura ya pagada")
    if invoice.status == "cancelled":
        raise ValueError("La factura ya está cancelada")
    invoice.status = "cancelled"
    await db.flush()
    await db.refresh(invoice, attribute_names=["lines"])
    return invoice


async def pay_supplier_invoice(
    db: AsyncSession, company_id: UUID, data: SupplierPaymentCreate
) -> SupplierInvoice:
    inv = await get_supplier_invoice(db, company_id, data.invoice_id)
    if not inv:
        raise ValueError("Factura de proveedor no encontrada")
    if inv.status == "cancelled":
        raise ValueError("No se puede pagar una factura cancelada")

    inv.amount_paid = float(inv.amount_paid) + data.amount
    if float(inv.amount_paid) >= float(inv.total):
        inv.status = "paid"
    elif inv.status == "draft":
        inv.status = "posted"

    await db.flush()
    await db.refresh(inv, attribute_names=["lines"])
    return inv
