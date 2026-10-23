"""
Schemas de Compras: órdenes de compra, facturas de proveedor y pagos.
"""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


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
    product_id: UUID
    variant_id: Optional[UUID]
    description: Optional[str]
    quantity: float
    qty_received: float = 0
    unit_price: float
    discount_pct: float
    tax_rate: float
    subtotal: float

    model_config = {"from_attributes": True}


class PurchaseOrderCreate(BaseModel):
    partner_id: UUID
    branch_id: Optional[UUID] = None
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    currency_code: Optional[str] = None
    notes: Optional[str] = None
    lines: List[PurchaseOrderLineCreate] = Field(..., min_length=1)


class PurchaseOrderUpdate(BaseModel):
    partner_id: Optional[UUID] = None
    branch_id: Optional[UUID] = None
    order_date: Optional[date] = None
    expected_date: Optional[date] = None
    currency_code: Optional[str] = None
    notes: Optional[str] = None
    lines: Optional[List[PurchaseOrderLineCreate]] = None


class PurchaseOrderOut(BaseModel):
    id: UUID
    company_id: UUID
    branch_id: Optional[UUID]
    partner_id: UUID
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
    lines: List[PurchaseOrderLineOut] = []

    model_config = {"from_attributes": True}


class PurchaseOrderListResponse(BaseModel):
    items: List[PurchaseOrderOut]
    total: int
    page: int
    page_size: int
    pages: int


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
    invoice_number: Optional[str] = None
    supplier_ref: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    currency_code: Optional[str] = None
    notes: Optional[str] = None
    lines: List[SupplierInvoiceLineCreate] = Field(..., min_length=1)


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


class ReceiveGoodsLine(BaseModel):
    product_id: UUID
    variant_id: Optional[UUID] = None
    quantity: float = Field(..., gt=0)
    warehouse_id: Optional[UUID] = None


class ReceiveGoods(BaseModel):
    warehouse_id: Optional[UUID] = None
    lines: List[ReceiveGoodsLine] = Field(..., min_length=1)
    notes: Optional[str] = None


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
    check_kind: Optional[str] = Field(None, pattern="^(own|third_party)$")
    check_number: Optional[str] = None
    check_bank_name: Optional[str] = None
    check_due_date: Optional[date] = None
