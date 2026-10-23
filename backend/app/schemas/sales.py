"""
Schemas de Ventas: pedidos/cotizaciones, facturas y pagos.
"""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Líneas de pedido
# ---------------------------------------------------------------------------

class SaleOrderLineCreate(BaseModel):
    product_id: UUID
    variant_id: Optional[UUID] = None
    description: Optional[str] = None
    quantity: float = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    discount_pct: float = Field(0, ge=0, le=100)
    tax_rate: float = Field(0, ge=0, le=100)


class SaleOrderLineOut(BaseModel):
    id: UUID
    product_id: UUID
    variant_id: Optional[UUID]
    description: Optional[str]
    quantity: float
    unit_price: float
    discount_pct: float
    tax_rate: float
    subtotal: float

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Pedidos / Cotizaciones
# ---------------------------------------------------------------------------

class SaleOrderCreate(BaseModel):
    partner_id: UUID
    branch_id: Optional[UUID] = None
    order_type: str = Field("quotation", pattern="^(quotation|order)$")
    order_date: Optional[date] = None
    validity_date: Optional[date] = None
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    notes: Optional[str] = None
    salesperson_id: Optional[UUID] = None
    lines: List[SaleOrderLineCreate] = Field(..., min_length=1)


class SaleOrderUpdate(BaseModel):
    partner_id: Optional[UUID] = None
    branch_id: Optional[UUID] = None
    order_date: Optional[date] = None
    validity_date: Optional[date] = None
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    notes: Optional[str] = None
    salesperson_id: Optional[UUID] = None
    lines: Optional[List[SaleOrderLineCreate]] = None


class SaleOrderOut(BaseModel):
    id: UUID
    company_id: UUID
    branch_id: Optional[UUID]
    partner_id: UUID
    order_number: str
    order_type: str
    status: str
    order_date: date
    validity_date: Optional[date]
    currency_code: Optional[str]
    subtotal: float
    tax_amount: float
    total: float
    notes: Optional[str]
    salesperson_id: Optional[UUID]
    created_by: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    lines: List[SaleOrderLineOut] = []

    model_config = {"from_attributes": True}


class SaleOrderListResponse(BaseModel):
    items: List[SaleOrderOut]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Facturas
# ---------------------------------------------------------------------------

class InvoiceLineCreate(BaseModel):
    product_id: Optional[UUID] = None
    description: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    discount_pct: float = Field(0, ge=0, le=100)
    tax_rate: float = Field(0, ge=0, le=100)


class InvoiceLineOut(BaseModel):
    id: UUID
    product_id: Optional[UUID]
    description: str
    quantity: float
    unit_price: float
    discount_pct: float
    tax_rate: float
    subtotal: float

    model_config = {"from_attributes": True}


class InvoiceCreate(BaseModel):
    partner_id: UUID
    sale_order_id: Optional[UUID] = None
    invoice_type: str = Field("invoice", pattern="^(invoice|credit_note|debit_note)$")
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    notes: Optional[str] = None
    lines: List[InvoiceLineCreate] = Field(..., min_length=1)


class InvoiceFromOrder(BaseModel):
    """Generar factura a partir de un pedido confirmado."""
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    due_date: Optional[date] = None
    notes: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(draft|posted|paid|cancelled)$")


class InvoiceOut(BaseModel):
    id: UUID
    company_id: UUID
    partner_id: UUID
    sale_order_id: Optional[UUID]
    invoice_number: str
    invoice_type: str
    status: str
    invoice_date: date
    due_date: Optional[date]
    currency_code: Optional[str]
    subtotal: float
    tax_amount: float
    total: float
    amount_paid: float
    amount_due: float  # total - amount_paid
    notes: Optional[str]
    created_by: Optional[UUID]
    created_at: datetime
    lines: List[InvoiceLineOut] = []

    model_config = {"from_attributes": True}


class InvoiceListResponse(BaseModel):
    items: List[InvoiceOut]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Pagos
# ---------------------------------------------------------------------------

class PaymentCreate(BaseModel):
    """Recibo de cobro. payment_method: cash | transfer | check | card | other"""
    partner_id: UUID
    invoice_id: Optional[UUID] = None
    amount: float = Field(..., gt=0)
    payment_date: Optional[date] = None
    payment_method: Optional[str] = Field(None, max_length=40)
    reference: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    bank_account_id: Optional[UUID] = Field(
        None, description="Obligatorio si payment_method = transfer"
    )
    # Datos de cheque de terceros (si payment_method = check)
    check_number: Optional[str] = None
    check_bank_name: Optional[str] = None
    check_due_date: Optional[date] = None


class PaymentOut(BaseModel):
    id: UUID
    company_id: UUID
    partner_id: UUID
    invoice_id: Optional[UUID]
    amount: float
    payment_date: date
    payment_method: Optional[str]
    reference: Optional[str]
    notes: Optional[str]
    bank_account_id: Optional[UUID] = None
    check_id: Optional[UUID] = None
    receipt_number: Optional[str] = None
    created_by: Optional[UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class PaymentListResponse(BaseModel):
    items: List[PaymentOut]
    total: int
    page: int
    page_size: int
    pages: int
