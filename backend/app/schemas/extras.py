"""Schemas de módulos de baja prioridad."""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# CRM
class OpportunityCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    partner_id: Optional[UUID] = None
    stage: str = Field("lead", pattern="^(lead|qualified|proposal|negotiation|won|lost)$")
    amount: Optional[float] = Field(None, ge=0)
    probability: int = Field(10, ge=0, le=100)
    expected_close: Optional[date] = None
    salesperson_id: Optional[UUID] = None
    notes: Optional[str] = None


class OpportunityUpdate(BaseModel):
    title: Optional[str] = None
    partner_id: Optional[UUID] = None
    stage: Optional[str] = Field(None, pattern="^(lead|qualified|proposal|negotiation|won|lost)$")
    amount: Optional[float] = None
    probability: Optional[int] = Field(None, ge=0, le=100)
    expected_close: Optional[date] = None
    salesperson_id: Optional[UUID] = None
    notes: Optional[str] = None


class OpportunityOut(BaseModel):
    id: UUID
    title: str
    partner_id: Optional[UUID]
    stage: str
    amount: Optional[float]
    probability: int
    expected_close: Optional[date]
    salesperson_id: Optional[UUID]
    notes: Optional[str]
    sale_order_id: Optional[UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class ActivityCreate(BaseModel):
    activity_type: str = Field("task", pattern="^(call|meeting|task|email|note)$")
    subject: str = Field(..., min_length=1)
    description: Optional[str] = None
    partner_id: Optional[UUID] = None
    opportunity_id: Optional[UUID] = None
    assigned_to: Optional[UUID] = None
    due_date: Optional[datetime] = None


class ActivityOut(BaseModel):
    id: UUID
    activity_type: str
    subject: str
    description: Optional[str]
    partner_id: Optional[UUID]
    opportunity_id: Optional[UUID]
    assigned_to: Optional[UUID]
    due_date: Optional[datetime]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


# Lots / serials
class StockLotCreate(BaseModel):
    product_id: UUID
    warehouse_id: Optional[UUID] = None
    lot_number: str = Field(..., min_length=1)
    quantity: float = Field(..., ge=0)
    expiry_date: Optional[date] = None
    manufactured_date: Optional[date] = None
    notes: Optional[str] = None


class StockLotOut(BaseModel):
    id: UUID
    product_id: UUID
    warehouse_id: Optional[UUID]
    lot_number: str
    quantity: float
    expiry_date: Optional[date]
    manufactured_date: Optional[date]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class StockSerialCreate(BaseModel):
    product_id: UUID
    warehouse_id: Optional[UUID] = None
    serial_number: str = Field(..., min_length=1)
    notes: Optional[str] = None


class StockSerialOut(BaseModel):
    id: UUID
    product_id: UUID
    warehouse_id: Optional[UUID]
    serial_number: str
    status: str
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# BOM
class BomLineCreate(BaseModel):
    component_id: UUID
    quantity: float = Field(..., gt=0)


class BomCreate(BaseModel):
    product_id: UUID
    name: str = "Default"
    quantity: float = Field(1, gt=0)
    lines: List[BomLineCreate] = Field(..., min_length=1)


class BomLineOut(BaseModel):
    id: UUID
    component_id: UUID
    quantity: float

    model_config = {"from_attributes": True}


class BomOut(BaseModel):
    id: UUID
    product_id: UUID
    name: str
    quantity: float
    is_active: bool
    lines: List[BomLineOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductionOrderCreate(BaseModel):
    bom_id: UUID
    quantity: float = Field(..., gt=0)
    warehouse_id: Optional[UUID] = None
    planned_date: Optional[date] = None
    notes: Optional[str] = None


class ProductionOrderOut(BaseModel):
    id: UUID
    bom_id: UUID
    product_id: UUID
    warehouse_id: Optional[UUID]
    order_number: str
    quantity: float
    status: str
    planned_date: Optional[date]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# Commissions
class CommissionRuleCreate(BaseModel):
    name: str
    rule_type: str = Field("percent_of_sale", pattern="^(percent_of_sale|percent_of_collection|fixed)$")
    rate: float = Field(..., ge=0)
    salesperson_id: Optional[UUID] = None


class CommissionRuleOut(BaseModel):
    id: UUID
    name: str
    rule_type: str
    rate: float
    salesperson_id: Optional[UUID]
    is_active: bool

    model_config = {"from_attributes": True}


class CommissionEntryOut(BaseModel):
    id: UUID
    salesperson_id: UUID
    rule_id: Optional[UUID]
    invoice_id: Optional[UUID]
    base_amount: float
    commission_amount: float
    status: str
    period: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# Currency
class CurrencyRateCreate(BaseModel):
    from_currency: str = Field(..., min_length=3, max_length=3)
    to_currency: str = Field(..., min_length=3, max_length=3)
    rate: float = Field(..., gt=0)
    rate_date: Optional[date] = None


class CurrencyRateOut(BaseModel):
    id: UUID
    from_currency: str
    to_currency: str
    rate: float
    rate_date: date

    model_config = {"from_attributes": True}


# Attachments
class AttachmentCreate(BaseModel):
    entity_type: str = Field(..., pattern="^(partner|product|invoice|sale_order|purchase_order|opportunity|other)$")
    entity_id: UUID
    file_name: str
    content_type: Optional[str] = None
    file_size: Optional[int] = None
    storage_path: str = Field(..., description="URL o path del archivo")


class AttachmentOut(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    file_name: str
    content_type: Optional[str]
    file_size: Optional[int]
    storage_path: str
    created_at: datetime

    model_config = {"from_attributes": True}


# Work orders
class WorkOrderCreate(BaseModel):
    title: str = Field(..., min_length=1)
    partner_id: Optional[UUID] = None
    description: Optional[str] = None
    priority: str = Field("normal", pattern="^(low|normal|high)$")
    assigned_to: Optional[UUID] = None
    scheduled_date: Optional[date] = None
    notes: Optional[str] = None


class WorkOrderUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(draft|scheduled|in_progress|done|cancelled)$")
    priority: Optional[str] = None
    assigned_to: Optional[UUID] = None
    scheduled_date: Optional[date] = None
    notes: Optional[str] = None


class WorkOrderOut(BaseModel):
    id: UUID
    order_number: str
    title: str
    partner_id: Optional[UUID]
    description: Optional[str]
    status: str
    priority: str
    assigned_to: Optional[UUID]
    scheduled_date: Optional[date]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# Payment provider
class PaymentProviderCreate(BaseModel):
    provider: str = Field(..., pattern="^(mercadopago|stripe|paypal|other)$")
    is_active: bool = False
    public_key: Optional[str] = None
    access_token: Optional[str] = None
    settings_json: Optional[str] = None


class PaymentProviderOut(BaseModel):
    id: UUID
    provider: str
    is_active: bool
    public_key: Optional[str]
    access_token_hint: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
