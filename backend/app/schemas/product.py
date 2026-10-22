"""
Schemas de Catálogo: Categorías, Productos, Variantes y Listas de precios.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Categorías
# ---------------------------------------------------------------------------

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    parent_id: Optional[UUID] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    parent_id: Optional[UUID] = None


class CategoryOut(BaseModel):
    id: UUID
    company_id: UUID
    parent_id: Optional[UUID]
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Variantes
# ---------------------------------------------------------------------------

class VariantCreate(BaseModel):
    sku: Optional[str] = Field(None, max_length=80)
    barcode: Optional[str] = Field(None, max_length=80)
    name: Optional[str] = Field(None, max_length=150, description='Ej: "Rojo / XL"')
    attributes: Dict[str, Any] = Field(default_factory=dict, description='Ej: {"color": "Rojo", "size": "XL"}')
    cost: float = Field(0, ge=0)
    is_active: bool = True


class VariantUpdate(BaseModel):
    sku: Optional[str] = Field(None, max_length=80)
    barcode: Optional[str] = Field(None, max_length=80)
    name: Optional[str] = Field(None, max_length=150)
    attributes: Optional[Dict[str, Any]] = None
    cost: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None


class VariantOut(BaseModel):
    id: UUID
    product_id: UUID
    sku: Optional[str]
    barcode: Optional[str]
    name: Optional[str]
    attributes: Dict[str, Any]
    cost: float
    is_active: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Productos
# ---------------------------------------------------------------------------

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=250)
    sku: Optional[str] = Field(None, max_length=80)
    barcode: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = None
    category_id: Optional[UUID] = None
    product_type: str = Field(
        "product",
        pattern="^(product|service|kit)$",
        description="product | service | kit",
    )
    track_stock: bool = True
    track_lots: bool = False
    track_serials: bool = False
    cost_method: str = Field("average", pattern="^(fifo|lifo|average)$")
    unit: str = Field("unit", max_length=30)
    weight: Optional[float] = Field(None, ge=0)
    images: List[str] = Field(default_factory=list)
    attributes: Dict[str, Any] = Field(default_factory=dict)
    variants: List[VariantCreate] = Field(
        default_factory=list,
        description="Variantes iniciales (opcional). Si no se envían, el producto no tiene variantes.",
    )


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=250)
    sku: Optional[str] = Field(None, max_length=80)
    barcode: Optional[str] = Field(None, max_length=80)
    description: Optional[str] = None
    category_id: Optional[UUID] = None
    product_type: Optional[str] = Field(None, pattern="^(product|service|kit)$")
    track_stock: Optional[bool] = None
    track_lots: Optional[bool] = None
    track_serials: Optional[bool] = None
    cost_method: Optional[str] = Field(None, pattern="^(fifo|lifo|average)$")
    unit: Optional[str] = Field(None, max_length=30)
    weight: Optional[float] = Field(None, ge=0)
    images: Optional[List[str]] = None
    attributes: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class ProductOut(BaseModel):
    id: UUID
    company_id: UUID
    category_id: Optional[UUID]
    sku: Optional[str]
    barcode: Optional[str]
    name: str
    description: Optional[str]
    product_type: str
    track_stock: bool
    track_lots: bool
    track_serials: bool
    cost_method: str
    unit: str
    weight: Optional[float]
    is_active: bool
    images: List[Any]
    attributes: Dict[str, Any]
    variants: List[VariantOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductListResponse(BaseModel):
    items: List[ProductOut]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Listas de precios
# ---------------------------------------------------------------------------

class PriceListItemCreate(BaseModel):
    product_id: UUID
    variant_id: Optional[UUID] = None
    price: float = Field(..., ge=0)
    min_qty: float = Field(1, ge=0)


class PriceListItemUpdate(BaseModel):
    price: Optional[float] = Field(None, ge=0)
    min_qty: Optional[float] = Field(None, ge=0)


class PriceListItemOut(BaseModel):
    id: UUID
    price_list_id: UUID
    product_id: UUID
    variant_id: Optional[UUID]
    price: float
    min_qty: float

    model_config = {"from_attributes": True}


class PriceListCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    currency_code: str = Field("ARS", min_length=3, max_length=3)
    is_default: bool = False
    items: List[PriceListItemCreate] = Field(default_factory=list)


class PriceListUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class PriceListOut(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    currency_code: str
    is_default: bool
    is_active: bool
    items: List[PriceListItemOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class PriceListListResponse(BaseModel):
    items: List[PriceListOut]
    total: int
    page: int
    page_size: int
    pages: int
