"""
API de Ventas: pedidos/cotizaciones, facturas y pagos.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DBSession
from app.schemas.sales import (
    InvoiceCreate,
    InvoiceFromOrder,
    InvoiceListResponse,
    InvoiceOut,
    InvoiceUpdate,
    PaymentCreate,
    PaymentListResponse,
    PaymentOut,
    SaleOrderCreate,
    SaleOrderListResponse,
    SaleOrderOut,
    SaleOrderUpdate,
)
from app.services import sales as sales_service

router = APIRouter(tags=["Ventas"])


def _invoice_out(inv) -> InvoiceOut:
    return InvoiceOut(
        id=inv.id,
        company_id=inv.company_id,
        partner_id=inv.partner_id,
        sale_order_id=inv.sale_order_id,
        invoice_number=inv.invoice_number,
        invoice_type=inv.invoice_type,
        status=inv.status,
        invoice_date=inv.invoice_date,
        due_date=inv.due_date,
        currency_code=inv.currency_code,
        subtotal=float(inv.subtotal),
        tax_amount=float(inv.tax_amount),
        total=float(inv.total),
        amount_paid=float(inv.amount_paid),
        amount_due=float(inv.total) - float(inv.amount_paid),
        notes=inv.notes,
        created_by=inv.created_by,
        created_at=inv.created_at,
        lines=inv.lines,
    )


# ===========================================================================
# PEDIDOS / COTIZACIONES
# ===========================================================================

@router.get(
    "/orders",
    response_model=SaleOrderListResponse,
    summary="Listar pedidos y cotizaciones",
)
async def list_orders(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, pattern="^(draft|confirmed|done|cancelled)$"),
    order_type: Optional[str] = Query(None, pattern="^(quotation|order)$"),
    partner_id: Optional[UUID] = None,
    search: Optional[str] = Query(None, description="Busca por número de pedido"),
):
    result = await sales_service.list_orders(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        status=status,
        order_type=order_type,
        partner_id=partner_id,
        search=search,
    )
    return SaleOrderListResponse(
        items=[SaleOrderOut.model_validate(o) for o in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get(
    "/orders/{order_id}",
    response_model=SaleOrderOut,
    summary="Detalle de pedido",
)
async def get_order(order_id: UUID, db: DBSession, current_user: CurrentUser):
    order = await sales_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return SaleOrderOut.model_validate(order)


@router.post(
    "/orders",
    response_model=SaleOrderOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear cotización o pedido",
)
async def create_order(
    data: SaleOrderCreate, db: DBSession, current_user: CurrentUser
):
    try:
        order = await sales_service.create_order(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SaleOrderOut.model_validate(order)


@router.patch(
    "/orders/{order_id}",
    response_model=SaleOrderOut,
    summary="Actualizar pedido (solo draft)",
)
async def update_order(
    order_id: UUID,
    data: SaleOrderUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    order = await sales_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        order = await sales_service.update_order(db, order, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SaleOrderOut.model_validate(order)


@router.post(
    "/orders/{order_id}/confirm",
    response_model=SaleOrderOut,
    summary="Confirmar pedido (descuenta stock)",
    description="Pasa de draft → confirmed. Si era cotización, la convierte en pedido. Descuenta stock de productos con track_stock=true.",
)
async def confirm_order(
    order_id: UUID, db: DBSession, current_user: CurrentUser
):
    order = await sales_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        order = await sales_service.confirm_order(db, order, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SaleOrderOut.model_validate(order)


@router.post(
    "/orders/{order_id}/cancel",
    response_model=SaleOrderOut,
    summary="Cancelar pedido (revierte stock si estaba confirmado)",
)
async def cancel_order(
    order_id: UUID, db: DBSession, current_user: CurrentUser
):
    order = await sales_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        order = await sales_service.cancel_order(db, order, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SaleOrderOut.model_validate(order)


@router.post(
    "/orders/{order_id}/done",
    response_model=SaleOrderOut,
    summary="Cerrar pedido (confirmed → done)",
)
async def mark_order_done(
    order_id: UUID, db: DBSession, current_user: CurrentUser
):
    order = await sales_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        order = await sales_service.mark_order_done(db, order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SaleOrderOut.model_validate(order)


@router.post(
    "/orders/{order_id}/invoice",
    response_model=InvoiceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Generar factura desde pedido",
)
async def invoice_from_order(
    order_id: UUID,
    data: InvoiceFromOrder,
    db: DBSession,
    current_user: CurrentUser,
):
    order = await sales_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        inv = await sales_service.create_invoice_from_order(
            db, current_user.company_id, current_user.id, order, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _invoice_out(inv)


# ===========================================================================
# FACTURAS
# ===========================================================================

@router.get(
    "/invoices",
    response_model=InvoiceListResponse,
    summary="Listar facturas",
)
async def list_invoices(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, pattern="^(draft|posted|paid|cancelled)$"),
    partner_id: Optional[UUID] = None,
    search: Optional[str] = Query(None, description="Busca por número de factura"),
):
    result = await sales_service.list_invoices(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        status=status,
        partner_id=partner_id,
        search=search,
    )
    return InvoiceListResponse(
        items=[_invoice_out(i) for i in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get(
    "/invoices/{invoice_id}",
    response_model=InvoiceOut,
    summary="Detalle de factura",
)
async def get_invoice(
    invoice_id: UUID, db: DBSession, current_user: CurrentUser
):
    inv = await sales_service.get_invoice(db, current_user.company_id, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return _invoice_out(inv)


@router.post(
    "/invoices",
    response_model=InvoiceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear factura manual",
)
async def create_invoice(
    data: InvoiceCreate, db: DBSession, current_user: CurrentUser
):
    try:
        inv = await sales_service.create_invoice(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _invoice_out(inv)


@router.post(
    "/invoices/{invoice_id}/post",
    response_model=InvoiceOut,
    summary="Contabilizar factura (draft → posted)",
)
async def post_invoice(
    invoice_id: UUID, db: DBSession, current_user: CurrentUser
):
    inv = await sales_service.get_invoice(db, current_user.company_id, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    try:
        inv = await sales_service.post_invoice(db, inv)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _invoice_out(inv)


@router.post(
    "/invoices/{invoice_id}/cancel",
    response_model=InvoiceOut,
    summary="Cancelar factura",
)
async def cancel_invoice(
    invoice_id: UUID, db: DBSession, current_user: CurrentUser
):
    inv = await sales_service.get_invoice(db, current_user.company_id, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    try:
        inv = await sales_service.cancel_invoice(db, inv)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _invoice_out(inv)


# ===========================================================================
# PAGOS
# ===========================================================================

@router.get(
    "/payments",
    response_model=PaymentListResponse,
    summary="Listar pagos",
)
async def list_payments(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    partner_id: Optional[UUID] = None,
    invoice_id: Optional[UUID] = None,
):
    result = await sales_service.list_payments(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        partner_id=partner_id,
        invoice_id=invoice_id,
    )
    return PaymentListResponse(
        items=[PaymentOut.model_validate(p) for p in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.post(
    "/payments",
    response_model=PaymentOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar pago",
    description="Si se asocia a una factura, actualiza amount_paid y puede marcarla como paid.",
)
async def create_payment(
    data: PaymentCreate, db: DBSession, current_user: CurrentUser
):
    try:
        payment = await sales_service.create_payment(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return PaymentOut.model_validate(payment)
