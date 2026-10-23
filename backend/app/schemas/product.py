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
    barcode: Optional[str] = Field(None, max_length=80, description="Código EAN / barras")
    brand: Optional[str] = Field(None, max_length=120, description="Marca")
    description: Optional[str] = None
    category_id: Optional[UUID] = None
    subcategory_id: Optional[UUID] = None
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
    brand: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = None
    category_id: Optional[UUID] = None
    subcategory_id: Optional[UUID] = None
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
    category_id: Optional[UUID] = None
    subcategory_id: Optional[UUID] = None
    brand: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    name: str
    description: Optional[str] = None
    product_type: str = "product"
    track_stock: bool = True
    track_lots: bool = False
    track_serials: bool = False
    cost_method: str = "average"
    unit: str = "unit"
    weight: Optional[float] = None
    is_active: bool = True
    images: List[Any] = []
    attributes: Dict[str, Any] = {}
    variants: List[VariantOut] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):
        # Normalizar None → defaults para JSONB
        if not isinstance(obj, dict):
            data = {
                "id": getattr(obj, "id", None),
                "company_id": getattr(obj, "company_id", None),
                "category_id": getattr(obj, "category_id", None),
                "subcategory_id": getattr(obj, "subcategory_id", None),
                "brand": getattr(obj, "brand", None),
                "sku": getattr(obj, "sku", None),
                "barcode": getattr(obj, "barcode", None),
                "name": getattr(obj, "name", ""),
                "description": getattr(obj, "description", None),
                "product_type": getattr(obj, "product_type", "product") or "product",
                "track_stock": bool(getattr(obj, "track_stock", True)),
                "track_lots": bool(getattr(obj, "track_lots", False)),
                "track_serials": bool(getattr(obj, "track_serials", False)),
                "cost_method": getattr(obj, "cost_method", "average") or "average",
                "unit": getattr(obj, "unit", "unit") or "unit",
                "weight": float(obj.weight) if getattr(obj, "weight", None) is not None else None,
                "is_active": bool(getattr(obj, "is_active", True)),
                "images": getattr(obj, "images", None) or [],
                "attributes": getattr(obj, "attributes", None) or {},
                "variants": list(getattr(obj, "variants", None) or []),
                "created_at": getattr(obj, "created_at", None),
                "updated_at": getattr(obj, "updated_at", None),
            }
            return super().model_validate(data, *args, **kwargs)
        return super().model_validate(obj, *args, **kwargs)


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
    discount_percent: float = Field(0, ge=0, le=100, description="% de descuento de la lista")
    discount_amount: float = Field(0, ge=0, description="Monto fijo de descuento")
    is_default: bool = False
    items: List[PriceListItemCreate] = Field(default_factory=list)


class PriceListUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    discount_percent: Optional[float] = Field(None, ge=0, le=100)
    discount_amount: Optional[float] = Field(None, ge=0)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


class PriceListOut(BaseModel):
    id: UUID
    company_id: UUID
    name: str
    currency_code: str
    discount_percent: Optional[float] = 0
    discount_amount: Optional[float] = 0
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
