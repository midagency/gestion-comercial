"""
Servicio de Reportes.
Agrega datos de ventas, compras, inventario, CxC/CxP y tesorería.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import case, cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Warehouse
from app.models.inventory import StockLevel, StockMove
from app.models.partner import Partner
from app.models.product import Product, ProductVariant
from app.models.purchases import PurchaseOrder, SupplierInvoice
from app.models.sales import Invoice, Payment, SaleOrder, SaleOrderLine
from app.models.treasury import CashMovement, CashRegister, CashSession
from app.services.treasury import _session_totals, list_bank_accounts


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _default_range(date_from: Optional[date], date_to: Optional[date]) -> tuple[date, date]:
    today = date.today()
    if date_to is None:
        date_to = today
    if date_from is None:
        date_from = _month_start(today)
    return date_from, date_to


# ===========================================================================
# DASHBOARD
# ===========================================================================

async def get_dashboard(db: AsyncSession, company_id: UUID) -> dict:
    today = date.today()
    month_start = _month_start(today)

    # Ventas hoy (pedidos confirmed/done)
    sales_today_q = await db.execute(
        select(func.coalesce(func.sum(SaleOrder.total), 0)).where(
            SaleOrder.company_id == company_id,
            SaleOrder.status.in_(["confirmed", "done"]),
            SaleOrder.order_date == today,
        )
    )
    sales_today = float(sales_today_q.scalar() or 0)

    # Ventas del mes
    sales_month_q = await db.execute(
        select(
            func.coalesce(func.sum(SaleOrder.total), 0),
            func.count(SaleOrder.id),
        ).where(
            SaleOrder.company_id == company_id,
            SaleOrder.status.in_(["confirmed", "done"]),
            SaleOrder.order_date >= month_start,
            SaleOrder.order_date <= today,
        )
    )
    row = sales_month_q.one()
    sales_this_month = float(row[0] or 0)
    sales_count = int(row[1] or 0)

    # Cobros del mes
    col_q = await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0)).where(
            Payment.company_id == company_id,
            Payment.payment_date >= month_start,
            Payment.payment_date <= today,
        )
    )
    collections = float(col_q.scalar() or 0)

    # Compras del mes
    purch_q = await db.execute(
        select(func.coalesce(func.sum(PurchaseOrder.total), 0)).where(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.in_(["confirmed", "partial", "received"]),
            PurchaseOrder.order_date >= month_start,
            PurchaseOrder.order_date <= today,
        )
    )
    purchases_month = float(purch_q.scalar() or 0)

    # Stock bajo / cero
    low_q = await db.execute(
        select(func.count()).where(
            StockLevel.company_id == company_id,
            StockLevel.quantity <= StockLevel.min_qty,
        )
    )
    low_stock = int(low_q.scalar() or 0)

    zero_q = await db.execute(
        select(func.count()).where(
            StockLevel.company_id == company_id,
            StockLevel.quantity <= 0,
        )
    )
    zero_stock = int(zero_q.scalar() or 0)

    # CxC: facturas posted/draft con saldo
    ar_q = await db.execute(
        select(
            func.coalesce(func.sum(Invoice.total - Invoice.amount_paid), 0)
        ).where(
            Invoice.company_id == company_id,
            Invoice.status.in_(["draft", "posted"]),
            Invoice.total > Invoice.amount_paid,
        )
    )
    ar = float(ar_q.scalar() or 0)

    # CxP
    ap_q = await db.execute(
        select(
            func.coalesce(func.sum(SupplierInvoice.total - SupplierInvoice.amount_paid), 0)
        ).where(
            SupplierInvoice.company_id == company_id,
            SupplierInvoice.status.in_(["draft", "posted"]),
            SupplierInvoice.total > SupplierInvoice.amount_paid,
        )
    )
    ap = float(ap_q.scalar() or 0)

    # Caja
    open_sess = await db.execute(
        select(CashSession)
        .options(selectinload(CashSession.movements))
        .where(CashSession.company_id == company_id, CashSession.status == "open")
    )
    sessions = open_sess.scalars().unique().all()
    cash_in = sum(_session_totals(s)[2] for s in sessions)

    accounts = await list_bank_accounts(db, company_id, is_active=True)
    bank_bal = sum(float(a.current_balance) for a in accounts)

    return {
        "sales_today": round(sales_today, 2),
        "sales_this_month": round(sales_this_month, 2),
        "sales_count_this_month": sales_count,
        "collections_this_month": round(collections, 2),
        "purchases_this_month": round(purchases_month, 2),
        "low_stock_count": low_stock,
        "zero_stock_count": zero_stock,
        "accounts_receivable": round(ar, 2),
        "accounts_payable": round(ap, 2),
        "open_cash_sessions": len(sessions),
        "cash_in_sessions": round(cash_in, 2),
        "bank_balance": round(bank_bal, 2),
    }


# ===========================================================================
# VENTAS POR PERÍODO
# ===========================================================================

async def sales_by_period(
    db: AsyncSession,
    company_id: UUID,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    group_by: str = "day",
) -> dict:
    date_from, date_to = _default_range(date_from, date_to)

    if group_by == "month":
        period_expr = func.to_char(SaleOrder.order_date, "YYYY-MM")
    else:
        period_expr = func.to_char(SaleOrder.order_date, "YYYY-MM-DD")
        group_by = "day"

    q = (
        select(
            period_expr.label("period"),
            func.count(SaleOrder.id).label("orders_count"),
            func.coalesce(func.sum(SaleOrder.subtotal), 0).label("subtotal"),
            func.coalesce(func.sum(SaleOrder.tax_amount), 0).label("tax_amount"),
            func.coalesce(func.sum(SaleOrder.total), 0).label("total"),
        )
        .where(
            SaleOrder.company_id == company_id,
            SaleOrder.status.in_(["confirmed", "done"]),
            SaleOrder.order_date >= date_from,
            SaleOrder.order_date <= date_to,
        )
        .group_by("period")
        .order_by("period")
    )
    result = await db.execute(q)
    items = []
    grand_total = 0.0
    grand_count = 0
    for row in result.all():
        total = float(row.total or 0)
        count = int(row.orders_count or 0)
        items.append({
            "period": row.period,
            "orders_count": count,
            "subtotal": float(row.subtotal or 0),
            "tax_amount": float(row.tax_amount or 0),
            "total": total,
        })
        grand_total += total
        grand_count += count

    return {
        "group_by": group_by,
        "date_from": date_from,
        "date_to": date_to,
        "items": items,
        "grand_total": round(grand_total, 2),
        "grand_count": grand_count,
    }


async def top_products(
    db: AsyncSession,
    company_id: UUID,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 20,
) -> dict:
    date_from, date_to = _default_range(date_from, date_to)
    limit = min(max(1, limit), 100)

    q = (
        select(
            SaleOrderLine.product_id,
            Product.name.label("product_name"),
            Product.sku,
            func.sum(SaleOrderLine.quantity).label("quantity_sold"),
            func.sum(SaleOrderLine.subtotal).label("revenue"),
        )
        .join(SaleOrder, SaleOrder.id == SaleOrderLine.order_id)
        .join(Product, Product.id == SaleOrderLine.product_id)
        .where(
            SaleOrder.company_id == company_id,
            SaleOrder.status.in_(["confirmed", "done"]),
            SaleOrder.order_date >= date_from,
            SaleOrder.order_date <= date_to,
        )
        .group_by(SaleOrderLine.product_id, Product.name, Product.sku)
        .order_by(func.sum(SaleOrderLine.subtotal).desc())
        .limit(limit)
    )
    result = await db.execute(q)
    items = []
    total_rev = 0.0
    for row in result.all():
        rev = float(row.revenue or 0)
        items.append({
            "product_id": row.product_id,
            "product_name": row.product_name,
            "sku": row.sku,
            "quantity_sold": float(row.quantity_sold or 0),
            "revenue": rev,
        })
        total_rev += rev

    return {
        "date_from": date_from,
        "date_to": date_to,
        "items": items,
        "total_revenue": round(total_rev, 2),
    }


async def top_customers(
    db: AsyncSession,
    company_id: UUID,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 20,
) -> dict:
    date_from, date_to = _default_range(date_from, date_to)
    limit = min(max(1, limit), 100)

    q = (
        select(
            SaleOrder.partner_id,
            Partner.name.label("partner_name"),
            func.count(SaleOrder.id).label("orders_count"),
            func.sum(SaleOrder.total).label("total"),
        )
        .join(Partner, Partner.id == SaleOrder.partner_id)
        .where(
            SaleOrder.company_id == company_id,
            SaleOrder.status.in_(["confirmed", "done"]),
            SaleOrder.order_date >= date_from,
            SaleOrder.order_date <= date_to,
        )
        .group_by(SaleOrder.partner_id, Partner.name)
        .order_by(func.sum(SaleOrder.total).desc())
        .limit(limit)
    )
    result = await db.execute(q)
    items = []
    total_rev = 0.0
    for row in result.all():
        total = float(row.total or 0)
        items.append({
            "partner_id": row.partner_id,
            "partner_name": row.partner_name,
            "orders_count": int(row.orders_count or 0),
            "total": total,
        })
        total_rev += total

    return {
        "date_from": date_from,
        "date_to": date_to,
        "items": items,
        "total_revenue": round(total_rev, 2),
    }


# ===========================================================================
# COMPRAS
# ===========================================================================

async def purchases_by_period(
    db: AsyncSession,
    company_id: UUID,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    group_by: str = "day",
) -> dict:
    date_from, date_to = _default_range(date_from, date_to)

    if group_by == "month":
        period_expr = func.to_char(PurchaseOrder.order_date, "YYYY-MM")
    else:
        period_expr = func.to_char(PurchaseOrder.order_date, "YYYY-MM-DD")
        group_by = "day"

    q = (
        select(
            period_expr.label("period"),
            func.count(PurchaseOrder.id).label("orders_count"),
            func.coalesce(func.sum(PurchaseOrder.total), 0).label("total"),
        )
        .where(
            PurchaseOrder.company_id == company_id,
            PurchaseOrder.status.in_(["confirmed", "partial", "received"]),
            PurchaseOrder.order_date >= date_from,
            PurchaseOrder.order_date <= date_to,
        )
        .group_by("period")
        .order_by("period")
    )
    result = await db.execute(q)
    items = []
    grand_total = 0.0
    grand_count = 0
    for row in result.all():
        total = float(row.total or 0)
        count = int(row.orders_count or 0)
        items.append({"period": row.period, "orders_count": count, "total": total})
        grand_total += total
        grand_count += count

    return {
        "group_by": group_by,
        "date_from": date_from,
        "date_to": date_to,
        "items": items,
        "grand_total": round(grand_total, 2),
        "grand_count": grand_count,
    }


# ===========================================================================
# INVENTARIO
# ===========================================================================

async def inventory_valuation(db: AsyncSession, company_id: UUID) -> dict:
    """Valuación aproximada usando cost de variante o 0."""
    q = (
        select(
            StockLevel,
            Product.name.label("product_name"),
            Product.sku,
            Warehouse.name.label("warehouse_name"),
            ProductVariant.cost.label("variant_cost"),
        )
        .join(Product, Product.id == StockLevel.product_id)
        .join(Warehouse, Warehouse.id == StockLevel.warehouse_id)
        .outerjoin(ProductVariant, ProductVariant.id == StockLevel.variant_id)
        .where(
            StockLevel.company_id == company_id,
            StockLevel.quantity > 0,
        )
        .order_by(Product.name)
    )
    result = await db.execute(q)
    items = []
    total_val = 0.0
    for row in result.all():
        level = row[0]
        qty = float(level.quantity)
        cost = float(row.variant_cost or 0)
        val = round(qty * cost, 2)
        items.append({
            "product_id": level.product_id,
            "product_name": row.product_name,
            "sku": row.sku,
            "warehouse_id": level.warehouse_id,
            "warehouse_name": row.warehouse_name,
            "quantity": qty,
            "unit_cost": cost,
            "valuation": val,
        })
        total_val += val

    return {
        "items": items,
        "total_valuation": round(total_val, 2),
        "products_count": len(items),
    }


async def stock_movements_summary(
    db: AsyncSession,
    company_id: UUID,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> dict:
    date_from, date_to = _default_range(date_from, date_to)
    # created_at es timestamptz; comparamos por fecha
    start_dt = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc)

    q = (
        select(
            StockMove.move_type,
            func.count(StockMove.id).label("count"),
            func.coalesce(func.sum(StockMove.quantity), 0).label("total_quantity"),
        )
        .where(
            StockMove.company_id == company_id,
            StockMove.created_at >= start_dt,
            StockMove.created_at <= end_dt,
        )
        .group_by(StockMove.move_type)
        .order_by(StockMove.move_type)
    )
    result = await db.execute(q)
    items = [
        {
            "move_type": row.move_type,
            "count": int(row.count or 0),
            "total_quantity": float(row.total_quantity or 0),
        }
        for row in result.all()
    ]
    return {"date_from": date_from, "date_to": date_to, "items": items}


# ===========================================================================
# AGING CxC / CxP
# ===========================================================================

def _aging_bucket(days: int) -> str:
    if days <= 0:
        return "current"
    if days <= 30:
        return "1-30"
    if days <= 60:
        return "31-60"
    if days <= 90:
        return "61-90"
    return "90+"


async def accounts_receivable_aging(
    db: AsyncSession, company_id: UUID, *, as_of: Optional[date] = None
) -> dict:
    as_of = as_of or date.today()

    q = (
        select(Invoice, Partner.name.label("partner_name"))
        .join(Partner, Partner.id == Invoice.partner_id)
        .where(
            Invoice.company_id == company_id,
            Invoice.status.in_(["draft", "posted"]),
            Invoice.total > Invoice.amount_paid,
        )
        .order_by(Invoice.due_date.nulls_last(), Invoice.invoice_date)
    )
    result = await db.execute(q)

    bucket_map = {b: {"label": b, "count": 0, "amount": 0.0} for b in ["current", "1-30", "31-60", "61-90", "90+"]}
    items = []
    total_due = 0.0

    for row in result.all():
        inv = row[0]
        due = inv.due_date or inv.invoice_date
        days = (as_of - due).days
        bucket = _aging_bucket(days)
        amount_due = float(inv.total) - float(inv.amount_paid)
        items.append({
            "document_id": inv.id,
            "document_number": inv.invoice_number,
            "partner_id": inv.partner_id,
            "partner_name": row.partner_name,
            "document_date": inv.invoice_date,
            "due_date": inv.due_date,
            "total": float(inv.total),
            "amount_paid": float(inv.amount_paid),
            "amount_due": round(amount_due, 2),
            "days_overdue": max(0, days),
            "bucket": bucket,
        })
        bucket_map[bucket]["count"] += 1
        bucket_map[bucket]["amount"] += amount_due
        total_due += amount_due

    buckets = [
        {"label": k, "count": v["count"], "amount": round(v["amount"], 2)}
        for k, v in bucket_map.items()
    ]
    return {
        "report_type": "receivable",
        "as_of": as_of,
        "buckets": buckets,
        "items": items,
        "total_due": round(total_due, 2),
    }


async def accounts_payable_aging(
    db: AsyncSession, company_id: UUID, *, as_of: Optional[date] = None
) -> dict:
    as_of = as_of or date.today()

    q = (
        select(SupplierInvoice, Partner.name.label("partner_name"))
        .join(Partner, Partner.id == SupplierInvoice.partner_id)
        .where(
            SupplierInvoice.company_id == company_id,
            SupplierInvoice.status.in_(["draft", "posted"]),
            SupplierInvoice.total > SupplierInvoice.amount_paid,
        )
        .order_by(SupplierInvoice.due_date.nulls_last(), SupplierInvoice.invoice_date)
    )
    result = await db.execute(q)

    bucket_map = {b: {"label": b, "count": 0, "amount": 0.0} for b in ["current", "1-30", "31-60", "61-90", "90+"]}
    items = []
    total_due = 0.0

    for row in result.all():
        inv = row[0]
        due = inv.due_date or inv.invoice_date
        days = (as_of - due).days
        bucket = _aging_bucket(days)
        amount_due = float(inv.total) - float(inv.amount_paid)
        items.append({
            "document_id": inv.id,
            "document_number": inv.invoice_number,
            "partner_id": inv.partner_id,
            "partner_name": row.partner_name,
            "document_date": inv.invoice_date,
            "due_date": inv.due_date,
            "total": float(inv.total),
            "amount_paid": float(inv.amount_paid),
            "amount_due": round(amount_due, 2),
            "days_overdue": max(0, days),
            "bucket": bucket,
        })
        bucket_map[bucket]["count"] += 1
        bucket_map[bucket]["amount"] += amount_due
        total_due += amount_due

    buckets = [
        {"label": k, "count": v["count"], "amount": round(v["amount"], 2)}
        for k, v in bucket_map.items()
    ]
    return {
        "report_type": "payable",
        "as_of": as_of,
        "buckets": buckets,
        "items": items,
        "total_due": round(total_due, 2),
    }


# ===========================================================================
# CAJA
# ===========================================================================

async def cash_sessions_report(
    db: AsyncSession,
    company_id: UUID,
    *,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> dict:
    date_from, date_to = _default_range(date_from, date_to)
    start_dt = datetime.combine(date_from, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(date_to, datetime.max.time()).replace(tzinfo=timezone.utc)

    q = (
        select(CashSession, CashRegister.name.label("register_name"))
        .join(CashRegister, CashRegister.id == CashSession.register_id)
        .options(selectinload(CashSession.movements))
        .where(
            CashSession.company_id == company_id,
            CashSession.opened_at >= start_dt,
            CashSession.opened_at <= end_dt,
        )
        .order_by(CashSession.opened_at.desc())
    )
    result = await db.execute(q)

    items = []
    total_diff = 0.0
    for row in result.unique().all():
        session = row[0]
        income, expense, expected = _session_totals(session)
        diff = float(session.difference) if session.difference is not None else None
        if diff is not None:
            total_diff += diff
        items.append({
            "session_id": session.id,
            "register_name": row.register_name,
            "opened_at": session.opened_at.isoformat() if session.opened_at else "",
            "closed_at": session.closed_at.isoformat() if session.closed_at else None,
            "opening_amount": float(session.opening_amount),
            "expected_amount": float(session.expected_amount) if session.expected_amount is not None else expected,
            "closing_amount": float(session.closing_amount) if session.closing_amount is not None else None,
            "difference": diff,
            "status": session.status,
            "total_income": income,
            "total_expense": expense,
        })

    return {
        "date_from": date_from,
        "date_to": date_to,
        "items": items,
        "total_difference": round(total_diff, 2),
    }
