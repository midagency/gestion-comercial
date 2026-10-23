"""
Servicio de Ventas.

Flujo principal:
  draft → confirmed (descuenta/reserva stock) → done
  confirmed → cancelled (revierte stock si se descontó)

Estados de factura: draft → posted → paid / cancelled
"""

from datetime import date
from math import ceil
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.inventory import StockLevel
from app.models.partner import Partner
from app.models.product import Product
from app.models.sales import Invoice, InvoiceLine, Payment, SaleOrder, SaleOrderLine
from app.schemas.sales import (
    InvoiceCreate,
    InvoiceFromOrder,
    InvoiceUpdate,
    PaymentCreate,
    SaleOrderCreate,
    SaleOrderUpdate,
)
from app.services.inventory import _apply_quantity_change, _get_or_create_stock_level


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _line_subtotal(qty: float, price: float, discount_pct: float) -> float:
    return round(qty * price * (1 - discount_pct / 100), 2)


def _calc_totals(lines_data: list) -> tuple[float, float, float]:
    """Devuelve (subtotal, tax_amount, total)."""
    subtotal = 0.0
    tax = 0.0
    for ln in lines_data:
        st = _line_subtotal(ln["quantity"], ln["unit_price"], ln["discount_pct"])
        subtotal += st
        tax += round(st * ln["tax_rate"] / 100, 2)
    return round(subtotal, 2), round(tax, 2), round(subtotal + tax, 2)


async def _next_number(
    db: AsyncSession, company_id: UUID, prefix: str, model, number_field: str
) -> str:
    """Genera número correlativo simple: PREFIX-00001."""
    result = await db.execute(
        select(func.count()).where(getattr(model, "company_id") == company_id)
    )
    count = (result.scalar() or 0) + 1
    return f"{prefix}-{count:05d}"


async def _validate_partner(db: AsyncSession, company_id: UUID, partner_id: UUID) -> Partner:
    result = await db.execute(
        select(Partner).where(
            Partner.id == partner_id,
            Partner.company_id == company_id,
            Partner.is_active == True,  # noqa: E712
        )
    )
    partner = result.scalar_one_or_none()
    if not partner:
        raise ValueError("Cliente no encontrado o inactivo")
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


async def _deduct_stock_for_order(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    order: SaleOrder,
    warehouse_id: Optional[UUID] = None,
) -> None:
    """Descuenta stock de las líneas del pedido. Usa el almacén principal si no se indica."""
    from app.models.company import Warehouse
    from app.models.inventory import StockMove

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
            raise ValueError("No hay almacén activo para descontar stock")
        warehouse_id = wh.id

    for line in order.lines:
        product = await _validate_product(db, company_id, line.product_id)
        if not product.track_stock:
            continue
        level = await _get_or_create_stock_level(
            db, company_id, warehouse_id, line.product_id, line.variant_id
        )
        await _apply_quantity_change(db, level, -float(line.quantity))
        move = StockMove(
            company_id=company_id,
            warehouse_id=warehouse_id,
            product_id=line.product_id,
            variant_id=line.variant_id,
            move_type="out",
            quantity=float(line.quantity),
            reference_type="sale_order",
            reference_id=order.id,
            notes=f"Pedido {order.order_number}",
            created_by=user_id,
        )
        db.add(move)


async def _restore_stock_for_order(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    order: SaleOrder,
) -> None:
    """Revierte el descuento de stock al cancelar un pedido confirmado."""
    from app.models.inventory import StockMove

    # Buscar movimientos de salida vinculados a este pedido
    result = await db.execute(
        select(StockMove).where(
            StockMove.company_id == company_id,
            StockMove.reference_type == "sale_order",
            StockMove.reference_id == order.id,
            StockMove.move_type == "out",
        )
    )
    moves = result.scalars().all()
    for move in moves:
        level = await _get_or_create_stock_level(
            db, company_id, move.warehouse_id, move.product_id, move.variant_id
        )
        await _apply_quantity_change(db, level, float(move.quantity), allow_negative=True)
        # Registrar movimiento de reversión
        rev = StockMove(
            company_id=company_id,
            warehouse_id=move.warehouse_id,
            product_id=move.product_id,
            variant_id=move.variant_id,
            move_type="in",
            quantity=float(move.quantity),
            reference_type="sale_order_cancel",
            reference_id=order.id,
            notes=f"Reversión cancelación pedido {order.order_number}",
            created_by=user_id,
        )
        db.add(rev)


def _invoice_to_out(inv: Invoice) -> dict:
    data = {
        "id": inv.id,
        "company_id": inv.company_id,
        "partner_id": inv.partner_id,
        "sale_order_id": inv.sale_order_id,
        "invoice_number": inv.invoice_number,
        "invoice_type": inv.invoice_type,
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
    return data


# ===========================================================================
# PEDIDOS / COTIZACIONES
# ===========================================================================

async def list_orders(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    status: Optional[str] = None,
    order_type: Optional[str] = None,
    partner_id: Optional[UUID] = None,
    search: Optional[str] = None,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = (
        select(SaleOrder)
        .options(selectinload(SaleOrder.lines))
        .where(SaleOrder.company_id == company_id)
    )
    if status:
        base = base.where(SaleOrder.status == status)
    if order_type:
        base = base.where(SaleOrder.order_type == order_type)
    if partner_id:
        base = base.where(SaleOrder.partner_id == partner_id)
    if search:
        term = f"%{search.strip()}%"
        base = base.where(SaleOrder.order_number.ilike(term))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(SaleOrder.created_at.desc()).offset(offset).limit(page_size)
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
) -> Optional[SaleOrder]:
    result = await db.execute(
        select(SaleOrder)
        .options(selectinload(SaleOrder.lines))
        .where(SaleOrder.id == order_id, SaleOrder.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_order(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: SaleOrderCreate
) -> SaleOrder:
    await _validate_partner(db, company_id, data.partner_id)

    lines_data = []
    for ln in data.lines:
        await _validate_product(db, company_id, ln.product_id)
        st = _line_subtotal(ln.quantity, ln.unit_price, ln.discount_pct)
        lines_data.append({**ln.model_dump(), "subtotal": st})

    subtotal, tax_amount, total = _calc_totals(lines_data)
    prefix = "COT" if data.order_type == "quotation" else "PED"
    order_number = await _next_number(db, company_id, prefix, SaleOrder, "order_number")

    order = SaleOrder(
        company_id=company_id,
        partner_id=data.partner_id,
        branch_id=data.branch_id,
        order_number=order_number,
        order_type=data.order_type,
        status="draft",
        order_date=data.order_date or date.today(),
        validity_date=data.validity_date,
        currency_code=data.currency_code,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        notes=data.notes,
        salesperson_id=data.salesperson_id or user_id,
        created_by=user_id,
    )
    db.add(order)
    await db.flush()

    for ld in lines_data:
        db.add(
            SaleOrderLine(
                order_id=order.id,
                product_id=ld["product_id"],
                variant_id=ld.get("variant_id"),
                description=ld.get("description"),
                quantity=ld["quantity"],
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
    db: AsyncSession, order: SaleOrder, data: SaleOrderUpdate
) -> SaleOrder:
    if order.status not in ("draft",):
        raise ValueError("Solo se pueden editar pedidos en estado draft")

    updates = data.model_dump(exclude_unset=True, exclude={"lines"})
    if "partner_id" in updates:
        await _validate_partner(db, order.company_id, updates["partner_id"])

    for field, value in updates.items():
        setattr(order, field, value)

    if data.lines is not None:
        # Reemplazar líneas
        for old in list(order.lines):
            await db.delete(old)
        await db.flush()

        lines_data = []
        for ln in data.lines:
            await _validate_product(db, order.company_id, ln.product_id)
            st = _line_subtotal(ln.quantity, ln.unit_price, ln.discount_pct)
            lines_data.append({**ln.model_dump(), "subtotal": st})
            db.add(
                SaleOrderLine(
                    order_id=order.id,
                    product_id=ln.product_id,
                    variant_id=ln.variant_id,
                    description=ln.description,
                    quantity=ln.quantity,
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


async def confirm_order(
    db: AsyncSession, order: SaleOrder, user_id: UUID
) -> SaleOrder:
    if order.status != "draft":
        raise ValueError("Solo se pueden confirmar pedidos en estado draft")

    # Si es cotización, convertir a pedido
    if order.order_type == "quotation":
        order.order_type = "order"

    order.status = "confirmed"
    await _deduct_stock_for_order(db, order.company_id, user_id, order)
    await db.flush()
    await db.refresh(order, attribute_names=["lines"])
    return order


async def cancel_order(
    db: AsyncSession, order: SaleOrder, user_id: UUID
) -> SaleOrder:
    if order.status in ("cancelled", "done"):
        raise ValueError(f"No se puede cancelar un pedido en estado {order.status}")

    if order.status == "confirmed":
        await _restore_stock_for_order(db, order.company_id, user_id, order)

    order.status = "cancelled"
    await db.flush()
    await db.refresh(order, attribute_names=["lines"])
    return order


async def mark_order_done(db: AsyncSession, order: SaleOrder) -> SaleOrder:
    if order.status != "confirmed":
        raise ValueError("Solo se pueden cerrar pedidos confirmados")
    order.status = "done"
    await db.flush()
    await db.refresh(order, attribute_names=["lines"])
    return order


# ===========================================================================
# FACTURAS
# ===========================================================================

async def list_invoices(
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
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(Invoice.company_id == company_id)
    )
    if status:
        base = base.where(Invoice.status == status)
    if partner_id:
        base = base.where(Invoice.partner_id == partner_id)
    if search:
        term = f"%{search.strip()}%"
        base = base.where(Invoice.invoice_number.ilike(term))

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(Invoice.created_at.desc()).offset(offset).limit(page_size)
    )
    items = result.scalars().unique().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def get_invoice(
    db: AsyncSession, company_id: UUID, invoice_id: UUID
) -> Optional[Invoice]:
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(Invoice.id == invoice_id, Invoice.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_invoice(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: InvoiceCreate
) -> Invoice:
    await _validate_partner(db, company_id, data.partner_id)

    lines_data = []
    for ln in data.lines:
        if ln.product_id:
            await _validate_product(db, company_id, ln.product_id)
        st = _line_subtotal(ln.quantity, ln.unit_price, ln.discount_pct)
        lines_data.append({**ln.model_dump(), "subtotal": st})

    subtotal, tax_amount, total = _calc_totals(lines_data)
    invoice_number = await _next_number(db, company_id, "FAC", Invoice, "invoice_number")

    inv = Invoice(
        company_id=company_id,
        partner_id=data.partner_id,
        sale_order_id=data.sale_order_id,
        invoice_number=invoice_number,
        invoice_type=data.invoice_type,
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
            InvoiceLine(
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


async def create_invoice_from_order(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    order: SaleOrder,
    data: InvoiceFromOrder,
) -> Invoice:
    if order.status not in ("confirmed", "done"):
        raise ValueError("Solo se puede facturar un pedido confirmado o cerrado")

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

    subtotal = float(order.subtotal)
    tax_amount = float(order.tax_amount)
    total = float(order.total)
    invoice_number = await _next_number(db, company_id, "FAC", Invoice, "invoice_number")

    inv = Invoice(
        company_id=company_id,
        partner_id=order.partner_id,
        sale_order_id=order.id,
        invoice_number=invoice_number,
        invoice_type="invoice",
        status="draft",
        invoice_date=data.invoice_date or date.today(),
        due_date=data.due_date,
        currency_code=order.currency_code,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        amount_paid=0,
        notes=data.notes or f"Factura generada desde pedido {order.order_number}",
        created_by=user_id,
    )
    db.add(inv)
    await db.flush()

    for ld in inv_lines:
        db.add(
            InvoiceLine(
                invoice_id=inv.id,
                product_id=ld["product_id"],
                description=ld["description"] or f"Ítem pedido {order.order_number}",
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


async def post_invoice(db: AsyncSession, invoice: Invoice) -> Invoice:
    if invoice.status != "draft":
        raise ValueError("Solo se pueden contabilizar facturas en estado draft")
    invoice.status = "posted"
    await db.flush()
    await db.refresh(invoice, attribute_names=["lines"])
    return invoice


async def cancel_invoice(db: AsyncSession, invoice: Invoice) -> Invoice:
    if invoice.status == "paid":
        raise ValueError("No se puede cancelar una factura ya pagada")
    if invoice.status == "cancelled":
        raise ValueError("La factura ya está cancelada")
    invoice.status = "cancelled"
    await db.flush()
    await db.refresh(invoice, attribute_names=["lines"])
    return invoice


# ===========================================================================
# PAGOS
# ===========================================================================

async def list_payments(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    partner_id: Optional[UUID] = None,
    invoice_id: Optional[UUID] = None,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = select(Payment).where(Payment.company_id == company_id)
    if partner_id:
        base = base.where(Payment.partner_id == partner_id)
    if invoice_id:
        base = base.where(Payment.invoice_id == invoice_id)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(Payment.created_at.desc()).offset(offset).limit(page_size)
    )
    items = result.scalars().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def create_payment(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: PaymentCreate
) -> Payment:
    """
    Emite recibo de cobro.
    - Actualiza cuenta corriente del cliente (amount_paid de la factura).
    - transfer → ingreso en cuenta bancaria.
    - check → crea cheque de terceros (pending).
    """
    await _validate_partner(db, company_id, data.partner_id)

    method = (data.payment_method or "cash").lower().strip()
    if method in ("transfer", "transferencia", "bank"):
        method = "transfer"
        if not data.bank_account_id:
            raise ValueError("Indicá la cuenta bancaria para cobro por transferencia")
    if method in ("check", "cheque"):
        method = "check"
        if not data.check_number:
            raise ValueError("Indicá el número de cheque (de terceros)")

    invoice = None
    if data.invoice_id:
        invoice = await get_invoice(db, company_id, data.invoice_id)
        if not invoice:
            raise ValueError("Factura no encontrada")
        if invoice.status == "cancelled":
            raise ValueError("No se puede cobrar una factura cancelada")
        if invoice.partner_id != data.partner_id:
            raise ValueError("El cliente del recibo no coincide con el de la factura")

    # Número de recibo simple
    from sqlalchemy import func as sa_func

    cnt = (
        await db.execute(
            select(sa_func.count()).select_from(Payment).where(Payment.company_id == company_id)
        )
    ).scalar() or 0
    receipt_number = f"REC-{cnt + 1:05d}"

    check_id = None
    if method == "check":
        from app.models.accounting import Check

        chk = Check(
            company_id=company_id,
            check_kind="third_party",
            bank_name=data.check_bank_name,
            check_number=data.check_number,
            amount=data.amount,
            due_date=data.check_due_date,
            partner_id=data.partner_id,
            status="pending",
            created_by=user_id,
            notes=f"Cobro recibo {receipt_number}",
        )
        db.add(chk)
        await db.flush()
        check_id = chk.id

    if method == "transfer" and data.bank_account_id:
        from app.models.treasury import BankAccount, BankTransaction

        ba = (
            await db.execute(
                select(BankAccount).where(
                    BankAccount.id == data.bank_account_id,
                    BankAccount.company_id == company_id,
                )
            )
        ).scalar_one_or_none()
        if not ba:
            raise ValueError("Cuenta bancaria no encontrada")
        ba.current_balance = float(ba.current_balance or 0) + float(data.amount)
        db.add(
            BankTransaction(
                company_id=company_id,
                account_id=ba.id,
                transaction_type="deposit",
                direction="income",
                amount=data.amount,
                transaction_date=data.payment_date or date.today(),
                description=f"Cobro recibo {receipt_number}",
                reference=data.reference or receipt_number,
                reference_type="payment",
                created_by=user_id,
            )
        )

    payment = Payment(
        company_id=company_id,
        partner_id=data.partner_id,
        invoice_id=data.invoice_id,
        amount=data.amount,
        payment_date=data.payment_date or date.today(),
        payment_method=method,
        reference=data.reference,
        notes=data.notes,
        bank_account_id=data.bank_account_id,
        check_id=check_id,
        receipt_number=receipt_number,
        created_by=user_id,
    )
    db.add(payment)

    # Cuenta corriente cliente
    if invoice:
        # Actualiza cuenta corriente: suma amount_paid (reduce saldo a cobrar)
        invoice.amount_paid = float(invoice.amount_paid) + float(data.amount)
        if float(invoice.amount_paid) >= float(invoice.total):
            invoice.status = "paid"
        elif invoice.status == "draft":
            invoice.status = "posted"

    await db.flush()
    await db.refresh(payment)
    return payment
