"""
Schemas del Punto de Venta (POS).
Pensado para ventas rápidas de mostrador.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class POSLineCreate(BaseModel):
    product_id: UUID
    variant_id: Optional[UUID] = None
    quantity: float = Field(..., gt=0)
    unit_price: Optional[float] = Field(
        None, ge=0, description="Si no se envía, se toma el precio de la lista default del producto"
    )
    discount_pct: float = Field(0, ge=0, le=100)
    tax_rate: float = Field(0, ge=0, le=100)
    description: Optional[str] = None


class POSPaymentLine(BaseModel):
    payment_method: str = Field(
        ...,
        pattern="^(cash|card|transfer|other)$",
        description="cash | card | transfer | other",
    )
    amount: float = Field(..., gt=0)
    reference: Optional[str] = Field(None, max_length=100, description="Nº de cupón, transferencia, etc.")


class POSSaleCreate(BaseModel):
    """Venta completa de POS: líneas + pagos en un solo request."""
    session_id: UUID = Field(..., description="Sesión de caja abierta (obligatoria)")
    partner_id: Optional[UUID] = Field(
        None, description="Cliente. Si no se envía, se usa 'Consumidor Final'"
    )
    warehouse_id: Optional[UUID] = Field(
        None, description="Almacén a descontar. Default: principal o el de la sucursal de la caja"
    )
    lines: List[POSLineCreate] = Field(..., min_length=1)
    payments: List[POSPaymentLine] = Field(..., min_length=1)
    notes: Optional[str] = None
    discount_global_pct: float = Field(0, ge=0, le=100, description="Descuento global sobre subtotal")

    @model_validator(mode="after")
    def payments_cover_total(self):
        # La validación exacta del total se hace en el servicio (necesita calcular precios)
        total_paid = sum(p.amount for p in self.payments)
        if total_paid <= 0:
            raise ValueError("Debe haber al menos un pago con monto > 0")
        return self


class POSLineOut(BaseModel):
    product_id: UUID
    variant_id: Optional[UUID]
    description: Optional[str]
    quantity: float
    unit_price: float
    discount_pct: float
    tax_rate: float
    subtotal: float


class POSPaymentOut(BaseModel):
    payment_method: str
    amount: float
    reference: Optional[str]


class POSSaleOut(BaseModel):
    sale_order_id: UUID
    invoice_id: UUID
    order_number: str
    invoice_number: str
    partner_id: UUID
    subtotal: float
    tax_amount: float
    total: float
    amount_paid: float
    change: float  # vuelto (si pago en efectivo > total)
    lines: List[POSLineOut]
    payments: List[POSPaymentOut]
    session_id: UUID
    created_at: datetime
    message: str


class POSProductQuick(BaseModel):
    """Producto para búsqueda rápida en POS (con precio y stock)."""
    id: UUID
    name: str
    sku: Optional[str]
    barcode: Optional[str]
    unit_price: Optional[float]
    stock_available: Optional[float]
    track_stock: bool
    product_type: str
    variants: List[dict] = []


class POSProductSearchResponse(BaseModel):
    items: List[POSProductQuick]
    total: int
