"""
Schemas de Partners (Clientes y Proveedores).
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class PartnerBase(BaseModel):
    partner_type: str = Field(
        ...,
        pattern="^(customer|supplier|both)$",
        description="customer | supplier | both",
        examples=["customer"],
    )
    name: str = Field(..., min_length=1, max_length=250)
    legal_name: Optional[str] = Field(None, max_length=250)
    tax_id: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=40)
    mobile: Optional[str] = Field(None, max_length=40)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    country_code: Optional[str] = Field(None, min_length=2, max_length=2)
    price_list_id: Optional[UUID] = None
    payment_term_days: int = Field(0, ge=0)
    credit_limit: float = Field(0, ge=0)
    tags: Optional[List[str]] = None
    notes: Optional[str] = None


class PartnerCreate(PartnerBase):
    pass


class PartnerUpdate(BaseModel):
    """Todos los campos opcionales para actualización parcial."""
    partner_type: Optional[str] = Field(None, pattern="^(customer|supplier|both)$")
    name: Optional[str] = Field(None, min_length=1, max_length=250)
    legal_name: Optional[str] = Field(None, max_length=250)
    tax_id: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=40)
    mobile: Optional[str] = Field(None, max_length=40)
    address: Optional[str] = None
    city: Optional[str] = Field(None, max_length=100)
    country_code: Optional[str] = Field(None, min_length=2, max_length=2)
    price_list_id: Optional[UUID] = None
    payment_term_days: Optional[int] = Field(None, ge=0)
    credit_limit: Optional[float] = Field(None, ge=0)
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class PartnerOut(PartnerBase):
    id: UUID
    company_id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PartnerListResponse(BaseModel):
    items: List[PartnerOut]
    total: int
    page: int
    page_size: int
    pages: int
