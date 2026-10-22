"""
Notas de crédito (ventas) y remitos de entrega.
"""

from datetime import date
from math import ceil
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Warehouse
from app.models.documents import DeliveryNote, DeliveryNoteLine
from app.models.inventory import StockMove
from app.models.partner import Partner
from app.models.product import Product
from app.models.sales import Invoice, InvoiceLine
from app.schemas.documents import (
    CreditNoteCreate,
    DeliveryNoteCreate,
    DeliveryNoteFromOrder,
    DeliveryNoteLineCreate,
)
from app.services.inventory import _apply_quantity_change, _get_or_create_stock_level
from app.services.sales import _line_subtotal, _next_number


async def create_credit_note(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    data: CreditNoteCreate,
) -> Invoice:
    """
    Crea una nota de crédito a partir de una factura de venta.
    Si reason=return y restore_stock=True, reingresa stock.
    """
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(
            Invoice.id == data.related_invoice_id,
            Invoice.company_id == company_id,
            Invoice.invoice_type == "invoice",
        )
    )
    origin = result.scalar_one_or_none()
    if not origin:
        raise ValueError("Factura de origen no encontrada")
    if origin.status == "cancelled":
        raise ValueError("No se puede emitir NC sobre una factura cancelada")

    # Líneas
    if data.lines:
        lines_src = [
            {
                "product_id": ln.product_id,
                "description": ln.description,
                "quantity": ln.quantity,
                "unit_price": ln.unit_price,
                "discount_pct": ln.discount_pct,
                "tax_rate": ln.tax_rate,
                "subtotal": _line_subtotal(ln.quantity, ln.unit_price, ln.discount_pct),
            }
            for ln in data.lines
        ]
    else:
        lines_src = [
            {
                "product_id": ln.product_id,
                "description": ln.description,
                "quantity": float(ln.quantity),
                "unit_price": float(ln.unit_price),
                "discount_pct": float(ln.discount_pct),
                "tax_rate": float(ln.tax_rate),
                "subtotal": float(ln.subtotal),
            }
            for ln in origin.lines
        ]

    subtotal = round(sum(l["subtotal"] for l in lines_src), 2)
    tax_amount = round(
        sum(round(l["subtotal"] * l["tax_rate"] / 100, 2) for l in lines_src), 2
    )
    total = round(subtotal + tax_amount, 2)

    number = await _next_number(db, company_id, "NC", Invoice, "invoice_number")
    nc = Invoice(
        company_id=company_id,
        partner_id=origin.partner_id,
        sale_order_id=origin.sale_order_id,
        related_invoice_id=origin.id,
        invoice_number=number,
        invoice_type="credit_note",
        status="posted",
        credit_reason=data.reason,
        invoice_date=date.today(),
        currency_code=origin.currency_code,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        amount_paid=0,
        notes=data.notes or f"NC sobre {origin.invoice_number} ({data.reason})",
        created_by=user_id,
    )
    db.add(nc)
    await db.flush()

    for ld in lines_src:
        db.add(
            InvoiceLine(
                invoice_id=nc.id,
                product_id=ld.get("product_id"),
                description=ld["description"],
                quantity=ld["quantity"],
                unit_price=ld["unit_price"],
                discount_pct=ld["discount_pct"],
                tax_rate=ld["tax_rate"],
                subtotal=ld["subtotal"],
            )
        )

    # Reingreso de stock
    if data.reason == "return" and data.restore_stock:
        warehouse_id = data.warehouse_id
        if not warehouse_id:
            wh = await db.execute(
                select(Warehouse).where(
                    Warehouse.company_id == company_id,
                    Warehouse.is_main == True,  # noqa: E712
                    Warehouse.is_active == True,  # noqa: E712
                )
            )
            w = wh.scalar_one_or_none()
            if not w:
                wh = await db.execute(
                    select(Warehouse).where(
                        Warehouse.company_id == company_id,
                        Warehouse.is_active == True,  # noqa: E712
                    ).limit(1)
                )
                w = wh.scalar_one_or_none()
            if not w:
                raise ValueError("No hay almacén para reingresar stock")
            warehouse_id = w.id

        for ld in lines_src:
            if not ld.get("product_id"):
                continue
            prod = await db.execute(
                select(Product).where(
                    Product.id == ld["product_id"],
                    Product.company_id == company_id,
                )
            )
            product = prod.scalar_one_or_none()
            if not product or not product.track_stock:
                continue
            level = await _get_or_create_stock_level(
                db, company_id, warehouse_id, ld["product_id"], None
            )
            await _apply_quantity_change(db, level, ld["quantity"])
            db.add(
                StockMove(
                    company_id=company_id,
                    warehouse_id=warehouse_id,
                    product_id=ld["product_id"],
                    variant_id=None,
                    move_type="in",
                    quantity=ld["quantity"],
                    reference_type="credit_note",
                    reference_id=nc.id,
                    notes=f"Devolución NC {number}",
                    created_by=user_id,
                )
            )

    # Reducir saldo de la factura origen (como si se “pagara” con la NC)
    origin.amount_paid = min(
        float(origin.total),
        float(origin.amount_paid) + total,
    )
    if float(origin.amount_paid) >= float(origin.total) - 0.01:
        origin.status = "paid"

    await db.flush()
    await db.refresh(nc, attribute_names=["lines"])
    return nc


async def list_credit_notes(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    base = (
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(
            Invoice.company_id == company_id,
            Invoice.invoice_type == "credit_note",
        )
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    result = await db.execute(
        base.order_by(Invoice.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = result.scalars().unique().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


# ---- Remitos ----

async def create_delivery_note(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: DeliveryNoteCreate
) -> DeliveryNote:
    partner = await db.execute(
        select(Partner).where(
            Partner.id == data.partner_id,
            Partner.company_id == company_id,
            Partner.is_active == True,  # noqa: E712
        )
    )
    if not partner.scalar_one_or_none():
        raise ValueError("Cliente no encontrado")

    for ln in data.lines:
        prod = await db.execute(
            select(Product).where(
                Product.id == ln.product_id,
                Product.company_id == company_id,
            )
        )
        if not prod.scalar_one_or_none():
            raise ValueError(f"Producto {ln.product_id} no encontrado")

    number = await _next_number(db, company_id, "REM", DeliveryNote, "note_number")
    note = DeliveryNote(
        company_id=company_id,
        partner_id=data.partner_id,
        sale_order_id=data.sale_order_id,
        invoice_id=data.invoice_id,
        warehouse_id=data.warehouse_id,
        note_number=number,
        status="draft",
        note_date=data.note_date or date.today(),
        delivery_address=data.delivery_address,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(note)
    await db.flush()
    for ln in data.lines:
        db.add(
            DeliveryNoteLine(
                note_id=note.id,
                product_id=ln.product_id,
                variant_id=ln.variant_id,
                description=ln.description,
                quantity=ln.quantity,
            )
        )
    await db.flush()
    await db.refresh(note, attribute_names=["lines"])
    return note


async def create_delivery_note_from_order(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    order_id: UUID,
    data: DeliveryNoteFromOrder,
) -> DeliveryNote:
    from app.models.sales import SaleOrder

    result = await db.execute(
        select(SaleOrder)
        .options(selectinload(SaleOrder.lines))
        .where(SaleOrder.id == order_id, SaleOrder.company_id == company_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise ValueError("Pedido no encontrado")
    if order.status not in ("confirmed", "done"):
        raise ValueError("Solo se puede generar remito de pedidos confirmados o cerrados")

    return await create_delivery_note(
        db,
        company_id,
        user_id,
        DeliveryNoteCreate(
            partner_id=order.partner_id,
            sale_order_id=order.id,
            warehouse_id=data.warehouse_id,
            delivery_address=data.delivery_address,
            notes=data.notes or f"Remito desde {order.order_number}",
            lines=[
                DeliveryNoteLineCreate(
                    product_id=ln.product_id,
                    variant_id=ln.variant_id,
                    description=ln.description,
                    quantity=float(ln.quantity),
                )
                for ln in order.lines
            ],
        ),
    )


async def confirm_delivery_note(
    db: AsyncSession, company_id: UUID, note_id: UUID
) -> DeliveryNote:
    result = await db.execute(
        select(DeliveryNote)
        .options(selectinload(DeliveryNote.lines))
        .where(DeliveryNote.id == note_id, DeliveryNote.company_id == company_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise ValueError("Remito no encontrado")
    if note.status != "draft":
        raise ValueError("Solo se pueden confirmar remitos en borrador")
    note.status = "confirmed"
    await db.flush()
    await db.refresh(note, attribute_names=["lines"])
    return note


async def mark_delivered(
    db: AsyncSession, company_id: UUID, note_id: UUID
) -> DeliveryNote:
    result = await db.execute(
        select(DeliveryNote)
        .options(selectinload(DeliveryNote.lines))
        .where(DeliveryNote.id == note_id, DeliveryNote.company_id == company_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise ValueError("Remito no encontrado")
    if note.status not in ("draft", "confirmed"):
        raise ValueError("Estado inválido para marcar como entregado")
    note.status = "delivered"
    await db.flush()
    await db.refresh(note, attribute_names=["lines"])
    return note


async def list_delivery_notes(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    base = (
        select(DeliveryNote)
        .options(selectinload(DeliveryNote.lines))
        .where(DeliveryNote.company_id == company_id)
    )
    if status:
        base = base.where(DeliveryNote.status == status)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    result = await db.execute(
        base.order_by(DeliveryNote.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = result.scalars().unique().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def get_delivery_note(
    db: AsyncSession, company_id: UUID, note_id: UUID
) -> Optional[DeliveryNote]:
    result = await db.execute(
        select(DeliveryNote)
        .options(selectinload(DeliveryNote.lines))
        .where(DeliveryNote.id == note_id, DeliveryNote.company_id == company_id)
    )
    return result.scalar_one_or_none()
