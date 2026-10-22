"""Schemas de configuración de empresa, sucursales, almacenes y usuarios."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class CompanyOut(BaseModel):
    id: UUID
    name: str
    legal_name: Optional[str]
    tax_id: Optional[str]
    logo_url: Optional[str]
    country_code: str
    currency_code: str
    business_type: Optional[str]
    settings: dict
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    legal_name: Optional[str] = None
    tax_id: Optional[str] = None
    logo_url: Optional[str] = None
    country_code: Optional[str] = Field(None, min_length=2, max_length=2)
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    business_type: Optional[str] = None
    settings: Optional[dict] = None


class BranchCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    code: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    is_main: bool = False


class BranchOut(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    code: Optional[str]
    address: Optional[str]
    city: Optional[str]
    is_main: bool
    is_active: bool

    model_config = {"from_attributes": True}


class WarehouseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    code: Optional[str] = None
    branch_id: Optional[UUID] = None
    is_main: bool = False


class WarehouseOut(BaseModel):
    id: UUID
    company_id: UUID
    branch_id: Optional[UUID]
    name: str
    code: Optional[str]
    is_main: bool
    is_active: bool

    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    is_system: bool
    permissions: list

    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    description: Optional[str] = None
    permissions: List[str] = Field(default_factory=list)


class UserOut(BaseModel):
    id: UUID
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    full_name: str
    phone: Optional[str]
    role_id: Optional[UUID]
    role_name: Optional[str] = None
    is_active: bool
    is_owner: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    role_id: Optional[UUID] = None


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    role_id: Optional[UUID] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=8)


# Permisos disponibles del sistema (referencia para UI)
AVAILABLE_PERMISSIONS = [
    "sales.view",
    "sales.create",
    "sales.confirm",
    "purchases.view",
    "purchases.create",
    "inventory.view",
    "inventory.move",
    "pos.use",
    "treasury.view",
    "treasury.manage",
    "reports.view",
    "partners.manage",
    "products.manage",
    "settings.manage",
    "users.manage",
]
