"""
API de Compras: órdenes de compra, recepción de mercadería y facturas de proveedor.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DBSession
from app.schemas.purchases import (
    PurchaseOrderCreate,
    PurchaseOrderListResponse,
    PurchaseOrderOut,
    PurchaseOrderUpdate,
    ReceiveGoodsRequest,
    SupplierInvoiceCreate,
    SupplierInvoiceFromOrder,
    SupplierInvoiceListResponse,
    SupplierInvoiceOut,
    SupplierPaymentCreate,
)
from app.services import purchases as purchases_service
from app.services.purchases import _invoice_out, _order_out

router = APIRouter(tags=["Compras"])


# ===========================================================================
# ÓRDENES DE COMPRA
# ===========================================================================

@router.get(
    "/purchase-orders",
    response_model=PurchaseOrderListResponse,
    summary="Listar órdenes de compra",
)
async def list_purchase_orders(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(
        None, pattern="^(draft|confirmed|partial|received|cancelled)$"
    ),
    partner_id: Optional[UUID] = None,
    search: Optional[str] = Query(None, description="Busca por número de OC"),
):
    result = await purchases_service.list_orders(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        status=status,
        partner_id=partner_id,
        search=search,
    )
    return PurchaseOrderListResponse(
        items=[PurchaseOrderOut(**_order_out(o)) for o in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get(
    "/purchase-orders/{order_id}",
    response_model=PurchaseOrderOut,
    summary="Detalle de orden de compra",
)
async def get_purchase_order(
    order_id: UUID, db: DBSession, current_user: CurrentUser
):
    order = await purchases_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    return PurchaseOrderOut(**_order_out(order))


@router.post(
    "/purchase-orders",
    response_model=PurchaseOrderOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear orden de compra",
)
async def create_purchase_order(
    data: PurchaseOrderCreate, db: DBSession, current_user: CurrentUser
):
    try:
        order = await purchases_service.create_order(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return PurchaseOrderOut(**_order_out(order))


@router.patch(
    "/purchase-orders/{order_id}",
    response_model=PurchaseOrderOut,
    summary="Actualizar orden de compra (solo draft)",
)
async def update_purchase_order(
    order_id: UUID,
    data: PurchaseOrderUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    order = await purchases_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    try:
        order = await purchases_service.update_order(db, order, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return PurchaseOrderOut(**_order_out(order))


@router.post(
    "/purchase-orders/{order_id}/confirm",
    response_model=PurchaseOrderOut,
    summary="Confirmar orden de compra",
)
async def confirm_purchase_order(
    order_id: UUID, db: DBSession, current_user: CurrentUser
):
    order = await purchases_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    try:
        order = await purchases_service.confirm_order(db, order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return PurchaseOrderOut(**_order_out(order))


@router.post(
    "/purchase-orders/{order_id}/cancel",
    response_model=PurchaseOrderOut,
    summary="Cancelar orden de compra",
)
async def cancel_purchase_order(
    order_id: UUID, db: DBSession, current_user: CurrentUser
):
    order = await purchases_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    try:
        order = await purchases_service.cancel_order(db, order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return PurchaseOrderOut(**_order_out(order))


@router.post(
    "/purchase-orders/{order_id}/receive",
    response_model=PurchaseOrderOut,
    summary="Recibir mercadería (total o parcial)",
    description=(
        "Actualiza qty_received de cada línea y genera movimientos de stock tipo 'in'. "
        "Si se recibe todo → status=received; si parcial → status=partial."
    ),
)
async def receive_goods(
    order_id: UUID,
    data: ReceiveGoodsRequest,
    db: DBSession,
    current_user: CurrentUser,
):
    order = await purchases_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    try:
        order = await purchases_service.receive_goods(
            db, current_user.company_id, current_user.id, order, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return PurchaseOrderOut(**_order_out(order))


@router.post(
    "/purchase-orders/{order_id}/invoice",
    response_model=SupplierInvoiceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Generar factura de proveedor desde OC",
)
async def invoice_from_purchase_order(
    order_id: UUID,
    data: SupplierInvoiceFromOrder,
    db: DBSession,
    current_user: CurrentUser,
):
    order = await purchases_service.get_order(db, current_user.company_id, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    try:
        inv = await purchases_service.create_supplier_invoice_from_order(
            db, current_user.company_id, current_user.id, order, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SupplierInvoiceOut(**_invoice_out(inv))


# ===========================================================================
# FACTURAS DE PROVEEDOR
# ===========================================================================

@router.get(
    "/supplier-invoices",
    response_model=SupplierInvoiceListResponse,
    summary="Listar facturas de proveedor",
)
async def list_supplier_invoices(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, pattern="^(draft|posted|paid|cancelled)$"),
    partner_id: Optional[UUID] = None,
    search: Optional[str] = Query(None, description="Busca por nº interno o ref. proveedor"),
):
    result = await purchases_service.list_supplier_invoices(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        status=status,
        partner_id=partner_id,
        search=search,
    )
    return SupplierInvoiceListResponse(
        items=[SupplierInvoiceOut(**_invoice_out(i)) for i in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get(
    "/supplier-invoices/{invoice_id}",
    response_model=SupplierInvoiceOut,
    summary="Detalle de factura de proveedor",
)
async def get_supplier_invoice(
    invoice_id: UUID, db: DBSession, current_user: CurrentUser
):
    inv = await purchases_service.get_supplier_invoice(
        db, current_user.company_id, invoice_id
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Factura de proveedor no encontrada")
    return SupplierInvoiceOut(**_invoice_out(inv))


@router.post(
    "/supplier-invoices",
    response_model=SupplierInvoiceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear factura de proveedor manual",
)
async def create_supplier_invoice(
    data: SupplierInvoiceCreate, db: DBSession, current_user: CurrentUser
):
    try:
        inv = await purchases_service.create_supplier_invoice(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SupplierInvoiceOut(**_invoice_out(inv))


@router.post(
    "/supplier-invoices/{invoice_id}/post",
    response_model=SupplierInvoiceOut,
    summary="Contabilizar factura de proveedor",
)
async def post_supplier_invoice(
    invoice_id: UUID, db: DBSession, current_user: CurrentUser
):
    inv = await purchases_service.get_supplier_invoice(
        db, current_user.company_id, invoice_id
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Factura de proveedor no encontrada")
    try:
        inv = await purchases_service.post_supplier_invoice(db, inv)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SupplierInvoiceOut(**_invoice_out(inv))


@router.post(
    "/supplier-invoices/{invoice_id}/cancel",
    response_model=SupplierInvoiceOut,
    summary="Cancelar factura de proveedor",
)
async def cancel_supplier_invoice(
    invoice_id: UUID, db: DBSession, current_user: CurrentUser
):
    inv = await purchases_service.get_supplier_invoice(
        db, current_user.company_id, invoice_id
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Factura de proveedor no encontrada")
    try:
        inv = await purchases_service.cancel_supplier_invoice(db, inv)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SupplierInvoiceOut(**_invoice_out(inv))


@router.post(
    "/supplier-invoices/pay",
    response_model=SupplierInvoiceOut,
    summary="Registrar pago a proveedor",
    description="Suma amount_paid y puede marcar la factura como paid.",
)
async def pay_supplier_invoice(
    data: SupplierPaymentCreate, db: DBSession, current_user: CurrentUser
):
    try:
        inv = await purchases_service.pay_supplier_invoice(
            db, current_user.company_id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SupplierInvoiceOut(**_invoice_out(inv))
