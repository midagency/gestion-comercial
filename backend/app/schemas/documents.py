"""Schemas: notas de crédito y remitos."""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---- Notas de crédito ----

class CreditNoteLineCreate(BaseModel):
    product_id: Optional[UUID] = None
    description: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)
    unit_price: float = Field(..., ge=0)
    discount_pct: float = Field(0, ge=0, le=100)
    tax_rate: float = Field(0, ge=0, le=100)


class CreditNoteCreate(BaseModel):
    related_invoice_id: UUID = Field(..., description="Factura de venta origen")
    reason: str = Field("return", pattern="^(return|discount|error|other)$")
    notes: Optional[str] = None
    warehouse_id: Optional[UUID] = Field(
        None, description="Almacén donde reingresa el stock (si reason=return)"
    )
    lines: Optional[List[CreditNoteLineCreate]] = Field(
        None, description="Si se omite, se copian todas las líneas de la factura"
    )
    restore_stock: bool = Field(
        True, description="Si reason=return, reingresar stock de productos trackeados"
    )


class CreditNoteOut(BaseModel):
    id: UUID
    company_id: UUID
    partner_id: UUID
    related_invoice_id: Optional[UUID]
    invoice_number: str
    invoice_type: str
    status: str
    credit_reason: Optional[str]
    invoice_date: date
    subtotal: float
    tax_amount: float
    total: float
    notes: Optional[str]
    created_at: datetime
    lines: list = []

    model_config = {"from_attributes": True}


# ---- Remitos ----

class DeliveryNoteLineCreate(BaseModel):
    product_id: UUID
    variant_id: Optional[UUID] = None
    description: Optional[str] = None
    quantity: float = Field(..., gt=0)


class DeliveryNoteCreate(BaseModel):
    partner_id: UUID
    sale_order_id: Optional[UUID] = None
    invoice_id: Optional[UUID] = None
    warehouse_id: Optional[UUID] = None
    note_date: Optional[date] = None
    delivery_address: Optional[str] = None
    notes: Optional[str] = None
    lines: List[DeliveryNoteLineCreate] = Field(..., min_length=1)


class DeliveryNoteFromOrder(BaseModel):
    warehouse_id: Optional[UUID] = None
    delivery_address: Optional[str] = None
    notes: Optional[str] = None


class DeliveryNoteLineOut(BaseModel):
    id: UUID
    product_id: UUID
    variant_id: Optional[UUID]
    description: Optional[str]
    quantity: float

    model_config = {"from_attributes": True}


class DeliveryNoteOut(BaseModel):
    id: UUID
    company_id: UUID
    partner_id: UUID
    sale_order_id: Optional[UUID]
    invoice_id: Optional[UUID]
    warehouse_id: Optional[UUID]
    note_number: str
    status: str
    note_date: date
    delivery_address: Optional[str]
    notes: Optional[str]
    created_by: Optional[UUID]
    created_at: datetime
    lines: List[DeliveryNoteLineOut] = []

    model_config = {"from_attributes": True}


class DeliveryNoteListResponse(BaseModel):
    items: List[DeliveryNoteOut]
    total: int
    page: int
    page_size: int
    pages: int
