"""
Schemas de Caja y Tesorería.
"""

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Cajas
# ---------------------------------------------------------------------------

class CashRegisterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: Optional[str] = Field(None, max_length=20)
    branch_id: Optional[UUID] = None


class CashRegisterUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = Field(None, max_length=20)
    branch_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class CashRegisterOut(BaseModel):
    id: UUID
    company_id: UUID
    branch_id: Optional[UUID]
    name: str
    code: Optional[str]
    is_active: bool
    created_at: datetime
    # info de sesión abierta (si hay)
    open_session_id: Optional[UUID] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Sesiones de caja
# ---------------------------------------------------------------------------

class CashSessionOpen(BaseModel):
    register_id: UUID
    opening_amount: float = Field(0, ge=0)
    notes: Optional[str] = None


class CashSessionClose(BaseModel):
    closing_amount: float = Field(..., ge=0, description="Efectivo contado al cerrar")
    notes: Optional[str] = None


class CashMovementOut(BaseModel):
    id: UUID
    session_id: UUID
    movement_type: str
    direction: str
    amount: float
    payment_method: Optional[str]
    reference_type: Optional[str]
    reference_id: Optional[UUID]
    description: Optional[str]
    created_by: Optional[UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class CashSessionOut(BaseModel):
    id: UUID
    company_id: UUID
    register_id: UUID
    opened_by: UUID
    closed_by: Optional[UUID]
    opened_at: datetime
    closed_at: Optional[datetime]
    opening_amount: float
    expected_amount: Optional[float]
    closing_amount: Optional[float]
    difference: Optional[float]
    status: str
    notes: Optional[str]
    movements: List[CashMovementOut] = []
    # totales calculados
    total_income: float = 0
    total_expense: float = 0

    model_config = {"from_attributes": True}


class CashSessionListResponse(BaseModel):
    items: List[CashSessionOut]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Movimientos manuales de caja
# ---------------------------------------------------------------------------

class CashMovementCreate(BaseModel):
    """Ingreso o egreso manual dentro de la sesión abierta."""
    session_id: UUID
    direction: str = Field(..., pattern="^(income|expense)$")
    amount: float = Field(..., gt=0)
    movement_type: str = Field(
        "adjustment",
        pattern="^(deposit|withdrawal|adjustment|transfer|other)$",
    )
    payment_method: Optional[str] = Field("cash", max_length=40)
    description: Optional[str] = None


# ---------------------------------------------------------------------------
# Cuentas bancarias
# ---------------------------------------------------------------------------

class BankAccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    bank_name: Optional[str] = Field(None, max_length=150)
    account_number: Optional[str] = Field(None, max_length=50)
    cbu_alias: Optional[str] = Field(None, max_length=100)
    currency_code: str = Field("ARS", min_length=3, max_length=3)
    current_balance: float = Field(0, description="Saldo inicial")
    notes: Optional[str] = None


class BankAccountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    bank_name: Optional[str] = Field(None, max_length=150)
    account_number: Optional[str] = Field(None, max_length=50)
    cbu_alias: Optional[str] = Field(None, max_length=100)
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class BankAccountOut(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    bank_name: Optional[str]
    account_number: Optional[str]
    cbu_alias: Optional[str]
    currency_code: str
    current_balance: float
    is_active: bool
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class BankTransactionCreate(BaseModel):
    account_id: UUID
    transaction_type: str = Field(
        ...,
        pattern="^(deposit|withdrawal|transfer_in|transfer_out|fee|adjustment)$",
    )
    amount: float = Field(..., gt=0)
    transaction_date: Optional[date] = None
    reference: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None

    @model_validator(mode="after")
    def set_direction(self):
        # direction se deriva del tipo; no lo pedimos al cliente
        return self


class BankTransactionOut(BaseModel):
    id: UUID
    company_id: UUID
    account_id: UUID
    transaction_type: str
    direction: str
    amount: float
    transaction_date: date
    reference: Optional[str]
    description: Optional[str]
    reference_type: Optional[str]
    reference_id: Optional[UUID]
    created_by: Optional[UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class BankTransactionListResponse(BaseModel):
    items: List[BankTransactionOut]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Resumen de tesorería
# ---------------------------------------------------------------------------

class TreasurySummary(BaseModel):
    open_sessions: int
    total_cash_in_open_sessions: float
    bank_accounts_count: int
    total_bank_balance: float
    registers_count: int
