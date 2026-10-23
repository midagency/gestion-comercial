"""
Schemas de Compras: órdenes de compra, recepción y facturas de proveedor.
"""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Líneas de orden de compra
# ---------------------------------------------------------------------------

class PurchaseOrderLineCreate(BaseModel):
    product_id: UUID
    variant_id: Optional[UUID] = None
    description: Optional[str] = None
    quantity: float = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    discount_pct: float = Field(0, ge=0, le=100)
    tax_rate: float = Field(0, ge=0, le=100)


class PurchaseOrderLineOut(BaseModel):
    id: UUID
    product_id: Optional[UUID] = None
    variant_id: Optional[UUID] = None
    description: Optional[str] = None
    quantity: float = 0
    qty_received: float = 0
    qty_pending: float = 0
    unit_price: float = 0
    discount_pct: float = 0
    tax_rate: float = 0
    subtotal: float = 0

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Órdenes de compra
# ---------------------------------------------------------------------------

class PurchaseOrderCreate(BaseModel):
    partner_id: UUID = Field(..., description="Proveedor")
    warehouse_id: Optional[UUID] = Field(None, description="Almacén de recepción previsto")
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    notes: Optional[str] = None
    lines: List[PurchaseOrderLineCreate] = Field(..., min_length=1)


class PurchaseOrderUpdate(BaseModel):
    partner_id: Optional[UUID] = None
    warehouse_id: Optional[UUID] = None
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    notes: Optional[str] = None
    lines: Optional[List[PurchaseOrderLineCreate]] = None


class PurchaseOrderOut(BaseModel):
    id: UUID
    company_id: UUID
    partner_id: UUID
    warehouse_id: Optional[UUID]
    order_number: str
    status: str
    order_date: date
    expected_date: Optional[date]
    currency_code: Optional[str]
    subtotal: float
    tax_amount: float
    total: float
    notes: Optional[str]
    created_by: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    lines: List[PurchaseOrderLineOut] = []

    model_config = {"from_attributes": True}


class PurchaseOrderListResponse(BaseModel):
    items: List[PurchaseOrderOut]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Recepción de mercadería
# ---------------------------------------------------------------------------

class ReceiptLine(BaseModel):
    line_id: UUID = Field(..., description="ID de la línea de la orden de compra")
    quantity: float = Field(..., gt=0, description="Cantidad a recibir en esta recepción")


class ReceiveGoodsRequest(BaseModel):
    warehouse_id: Optional[UUID] = Field(
        None, description="Almacén destino. Si no se indica, usa el de la OC o el principal."
    )
    lines: List[ReceiptLine] = Field(..., min_length=1)
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Facturas de proveedor
# ---------------------------------------------------------------------------

class SupplierInvoiceLineCreate(BaseModel):
    product_id: Optional[UUID] = None
    description: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    discount_pct: float = Field(0, ge=0, le=100)
    tax_rate: float = Field(0, ge=0, le=100)


class SupplierInvoiceLineOut(BaseModel):
    id: UUID
    product_id: Optional[UUID]
    description: str
    quantity: float
    unit_price: float
    discount_pct: float
    tax_rate: float
    subtotal: float

    model_config = {"from_attributes": True}


class SupplierInvoiceCreate(BaseModel):
    partner_id: UUID
    purchase_order_id: Optional[UUID] = None
    supplier_ref: Optional[str] = Field(None, max_length=80, description="Nº de factura del proveedor")
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    notes: Optional[str] = None
    lines: List[SupplierInvoiceLineCreate] = Field(..., min_length=1)


class SupplierInvoiceFromOrder(BaseModel):
    supplier_ref: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class SupplierInvoiceOut(BaseModel):
    id: UUID
    company_id: UUID
    partner_id: UUID
    purchase_order_id: Optional[UUID]
    invoice_number: str
    supplier_ref: Optional[str]
    status: str
    invoice_date: date
    due_date: Optional[date]
    currency_code: Optional[str]
    subtotal: float
    tax_amount: float
    total: float
    amount_paid: float
    amount_due: float
    notes: Optional[str]
    created_by: Optional[UUID]
    created_at: datetime
    lines: List[SupplierInvoiceLineOut] = []

    model_config = {"from_attributes": True}


class SupplierInvoiceListResponse(BaseModel):
    items: List[SupplierInvoiceOut]
    total: int
    page: int
    page_size: int
    pages: int


class SupplierPaymentCreate(BaseModel):
    """Orden de pago a proveedor. payment_method: cash | transfer | check | other"""
    invoice_id: UUID
    amount: float = Field(..., gt=0)
    payment_date: Optional[date] = None
    payment_method: Optional[str] = Field(None, max_length=40)
    reference: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    bank_account_id: Optional[UUID] = Field(
        None, description="Obligatorio si payment_method = transfer"
    )
    # Cheque: own (propio) | third_party (de terceros)
    check_kind: Optional[str] = Field(None, pattern="^(own|third_party)$")
    check_number: Optional[str] = None
    check_bank_name: Optional[str] = None
    check_due_date: Optional[date] = None
