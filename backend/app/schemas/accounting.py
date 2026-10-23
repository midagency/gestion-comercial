"""Schemas de contabilidad, cheques y notificaciones."""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class AccountCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=30)
    name: str = Field(..., min_length=1, max_length=200)
    account_type: str = Field(..., pattern="^(asset|liability|equity|income|expense)$")
    parent_id: Optional[UUID] = None


class AccountOut(BaseModel):
    id: UUID
    code: str
    name: str
    account_type: str
    parent_id: Optional[UUID]
    is_active: bool

    model_config = {"from_attributes": True}


class JournalLineCreate(BaseModel):
    account_id: UUID
    description: Optional[str] = None
    debit: float = Field(0, ge=0)
    credit: float = Field(0, ge=0)

    @model_validator(mode="after")
    def one_side(self):
        if self.debit > 0 and self.credit > 0:
            raise ValueError("Una línea no puede tener debe y haber a la vez")
        if self.debit == 0 and self.credit == 0:
            raise ValueError("La línea debe tener debe o haber")
        return self


class JournalEntryCreate(BaseModel):
    entry_date: Optional[date] = None
    description: Optional[str] = None
    lines: List[JournalLineCreate] = Field(..., min_length=2)

    @model_validator(mode="after")
    def balanced(self):
        d = sum(l.debit for l in self.lines)
        c = sum(l.credit for l in self.lines)
        if abs(d - c) > 0.01:
            raise ValueError(f"Asiento desbalanceado: Debe {d:.2f} ≠ Haber {c:.2f}")
        return self


class JournalLineOut(BaseModel):
    id: UUID
    account_id: UUID
    description: Optional[str]
    debit: float
    credit: float

    model_config = {"from_attributes": True}


class JournalEntryOut(BaseModel):
    id: UUID
    entry_number: str
    entry_date: date
    description: Optional[str]
    status: str
    lines: List[JournalLineOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class CheckCreate(BaseModel):
    check_kind: str = Field(..., pattern="^(third_party|own)$")
    bank_name: Optional[str] = None
    check_number: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    currency_code: str = "ARS"
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    partner_id: Optional[UUID] = None
    bank_account_id: Optional[UUID] = None
    notes: Optional[str] = None


class CheckOut(BaseModel):
    id: UUID
    check_kind: str
    bank_name: Optional[str]
    check_number: str
    amount: float
    currency_code: str
    issue_date: date
    due_date: Optional[date]
    partner_id: Optional[UUID]
    status: str
    bank_account_id: Optional[UUID]
    notes: Optional[str]
    created_at: datetime
    days_to_due: Optional[int] = None

    model_config = {"from_attributes": True}


class CheckStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        pattern="^(pending|deposited|cleared|bounced|cancelled|delivered)$",
    )
    bank_account_id: Optional[UUID] = Field(
        None,
        description="Cuenta banco: requerida al depositar o acreditar",
    )


class NotificationOut(BaseModel):
    id: UUID
    title: str
    body: Optional[str]
    level: str
    link: Optional[str]
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class EInvoiceRequest(BaseModel):
    """Solicitud de autorización fiscal (simulada o real)."""
    point_of_sale: str = Field("1", max_length=10)
    voucher_type: str = Field("6", description="6=Factura B, 1=A, 11=C")
    simulate: bool = Field(True, description="True = genera CAE simulado sin AFIP")
