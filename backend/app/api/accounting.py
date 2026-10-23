"""API contabilidad, cheques, facturación electrónica, notificaciones y export."""

import csv
import io
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser, DBSession
from app.schemas.accounting import (
    AccountCreate,
    AccountOut,
    CheckCreate,
    CheckOut,
    CheckStatusUpdate,
    EInvoiceRequest,
    JournalEntryCreate,
    JournalEntryOut,
    NotificationOut,
)
from app.services import accounting as accounting_service
from app.services.sales import list_invoices
from app.services.partner import list_partners
from app.services.product import list_products

router = APIRouter(tags=["Contabilidad formal"])


# ---- Plan de cuentas ----

@router.get("/accounting/accounts", response_model=list[AccountOut])
async def list_accounts(db: DBSession, current_user: CurrentUser):
    items = await accounting_service.list_accounts(db, current_user.company_id)
    return [AccountOut.model_validate(a) for a in items]


@router.post(
    "/accounting/accounts/seed",
    response_model=list[AccountOut],
    summary="Cargar plan de cuentas por defecto",
)
async def seed_accounts(db: DBSession, current_user: CurrentUser):
    items = await accounting_service.seed_chart_of_accounts(
        db, current_user.company_id
    )
    return [AccountOut.model_validate(a) for a in items]


@router.post(
    "/accounting/accounts",
    response_model=AccountOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_account(
    data: AccountCreate, db: DBSession, current_user: CurrentUser
):
    try:
        acc = await accounting_service.create_account(
            db, current_user.company_id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return AccountOut.model_validate(acc)


@router.get("/accounting/trial-balance")
async def trial_balance(db: DBSession, current_user: CurrentUser):
    return await accounting_service.trial_balance(db, current_user.company_id)


@router.get("/accounting/entries")
async def list_entries(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    result = await accounting_service.list_journal_entries(
        db, current_user.company_id, page=page, page_size=page_size
    )
    return {
        "items": [JournalEntryOut.model_validate(i) for i in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "pages": result["pages"],
    }


@router.post(
    "/accounting/entries",
    response_model=JournalEntryOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_entry(
    data: JournalEntryCreate, db: DBSession, current_user: CurrentUser
):
    try:
        entry = await accounting_service.create_journal_entry(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return JournalEntryOut.model_validate(entry)


# ---- Cheques ----

@router.get("/checks", response_model=list[CheckOut])
async def list_checks(
    db: DBSession,
    current_user: CurrentUser,
    check_kind: Optional[str] = Query(None, pattern="^(third_party|own)$"),
    status: Optional[str] = None,
):
    from datetime import date as date_cls

    items = await accounting_service.list_checks(
        db, current_user.company_id, check_kind=check_kind, status=status
    )
    out = []
    today = date_cls.today()
    for c in items:
        row = CheckOut.model_validate(c)
        if c.due_date:
            row.days_to_due = (c.due_date - today).days
        out.append(row)
    return out


@router.post("/checks", response_model=CheckOut, status_code=status.HTTP_201_CREATED)
async def create_check(
    data: CheckCreate, db: DBSession, current_user: CurrentUser
):
    chk = await accounting_service.create_check(
        db, current_user.company_id, current_user.id, data
    )
    return CheckOut.model_validate(chk)


@router.patch("/checks/{check_id}/status", response_model=CheckOut)
async def update_check_status(
    check_id: UUID,
    data: CheckStatusUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    try:
        chk = await accounting_service.update_check_status(
            db, current_user.company_id, check_id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CheckOut.model_validate(chk)


# ---- Facturación electrónica ----

@router.post(
    "/invoices/{invoice_id}/authorize",
    summary="Autorizar factura (CAE simulado o AFIP)",
)
async def authorize_invoice(
    invoice_id: UUID,
    data: EInvoiceRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    try:
        inv = await accounting_service.authorize_invoice(
            db, current_user.company_id, invoice_id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "id": inv.id,
        "invoice_number": inv.invoice_number,
        "cae": inv.cae,
        "cae_due_date": inv.cae_due_date,
        "fiscal_status": inv.fiscal_status,
        "fiscal_point_of_sale": inv.fiscal_point_of_sale,
        "fiscal_voucher_type": inv.fiscal_voucher_type,
    }


# ---- Notificaciones ----

@router.get("/notifications", response_model=list[NotificationOut])
async def list_notifications(
    db: DBSession,
    current_user: CurrentUser,
    unread_only: bool = False,
):
    items = await accounting_service.list_notifications(
        db, current_user.company_id, current_user.id, unread_only=unread_only
    )
    return [NotificationOut.model_validate(n) for n in items]


@router.post("/notifications/{notif_id}/read", response_model=NotificationOut)
async def mark_read(
    notif_id: UUID, db: DBSession, current_user: CurrentUser
):
    try:
        n = await accounting_service.mark_notification_read(
            db, current_user.company_id, notif_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return NotificationOut.model_validate(n)


# ---- Exportaciones CSV ----

@router.get("/export/partners.csv")
async def export_partners(db: DBSession, current_user: CurrentUser):
    result = await list_partners(
        db, current_user.company_id, page=1, page_size=100
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "name", "tax_id", "partner_type", "email", "phone", "city"])
    for p in result["items"]:
        w.writerow(
            [
                str(p.id),
                p.name,
                p.tax_id or "",
                p.partner_type,
                p.email or "",
                p.phone or "",
                p.city or "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=partners.csv"},
    )


@router.get("/export/products.csv")
async def export_products(db: DBSession, current_user: CurrentUser):
    result = await list_products(
        db, current_user.company_id, page=1, page_size=100
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "name", "sku", "product_type", "track_stock", "is_active"])
    for p in result["items"]:
        w.writerow(
            [
                str(p.id),
                p.name,
                p.sku or "",
                getattr(p, "product_type", "") or "",
                getattr(p, "track_stock", True),
                p.is_active,
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=products.csv"},
    )


@router.get("/export/invoices.csv")
async def export_invoices(db: DBSession, current_user: CurrentUser):
    result = await list_invoices(
        db, current_user.company_id, page=1, page_size=100
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        [
            "invoice_number",
            "type",
            "status",
            "date",
            "partner_id",
            "subtotal",
            "tax",
            "total",
            "amount_paid",
            "cae",
            "fiscal_status",
        ]
    )
    for inv in result["items"]:
        w.writerow(
            [
                inv.invoice_number,
                inv.invoice_type,
                inv.status,
                inv.invoice_date,
                str(inv.partner_id),
                float(inv.subtotal),
                float(inv.tax_amount),
                float(inv.total),
                float(inv.amount_paid),
                inv.cae or "",
                inv.fiscal_status or "",
            ]
        )
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=invoices.csv"},
    )
