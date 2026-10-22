"""
Schemas de Inventario: niveles de stock y movimientos.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Niveles de stock
# ---------------------------------------------------------------------------

class StockLevelOut(BaseModel):
    id: UUID
    company_id: UUID
    warehouse_id: UUID
    product_id: UUID
    variant_id: Optional[UUID]
    quantity: float
    reserved_qty: float
    available_qty: float  # quantity - reserved_qty (calculado)
    min_qty: float
    max_qty: Optional[float]
    is_low_stock: bool  # quantity <= min_qty

    model_config = {"from_attributes": True}


class StockLevelUpdate(BaseModel):
    """Solo se permiten editar umbrales, no la cantidad (eso va por movimientos)."""
    min_qty: Optional[float] = Field(None, ge=0)
    max_qty: Optional[float] = Field(None, ge=0)


class StockLevelListResponse(BaseModel):
    items: List[StockLevelOut]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Movimientos de stock
# ---------------------------------------------------------------------------

class StockMoveCreate(BaseModel):
    """
    Movimiento genérico.
    - in: entrada (compra, producción, ajuste positivo)
    - out: salida (venta, merma, ajuste negativo)
    - transfer: requiere warehouse_to_id
    - adjustment: corrige al valor absoluto indicado en quantity (se calcula la diferencia)
    """
    warehouse_id: UUID
    product_id: UUID
    variant_id: Optional[UUID] = None
    move_type: str = Field(..., pattern="^(in|out|transfer|adjustment)$")
    quantity: float = Field(..., description="Cantidad. En adjustment = stock final deseado.")
    warehouse_to_id: Optional[UUID] = Field(
        None, description="Obligatorio si move_type = transfer"
    )
    reference_type: Optional[str] = Field(
        None, max_length=40, description="sale_order, purchase_order, manual, etc."
    )
    reference_id: Optional[UUID] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_transfer(self):
        if self.move_type == "transfer" and not self.warehouse_to_id:
            raise ValueError("warehouse_to_id es obligatorio en transferencias")
        if self.move_type == "transfer" and self.warehouse_to_id == self.warehouse_id:
            raise ValueError("El almacén destino debe ser distinto al origen")
        if self.move_type in ("in", "out", "transfer") and self.quantity <= 0:
            raise ValueError("La cantidad debe ser mayor a 0")
        if self.move_type == "adjustment" and self.quantity < 0:
            raise ValueError("En un ajuste la cantidad (stock final) no puede ser negativa")
        return self


class StockMoveOut(BaseModel):
    id: UUID
    company_id: UUID
    warehouse_id: UUID
    product_id: UUID
    variant_id: Optional[UUID]
    move_type: str
    quantity: float
    reference_type: Optional[str]
    reference_id: Optional[UUID]
    notes: Optional[str]
    created_by: Optional[UUID]
    created_at: datetime

    model_config = {"from_attributes": True}


class StockMoveListResponse(BaseModel):
    items: List[StockMoveOut]
    total: int
    page: int
    page_size: int
    pages: int


# ---------------------------------------------------------------------------
# Resumen / alertas
# ---------------------------------------------------------------------------

class LowStockItem(BaseModel):
    product_id: UUID
    product_name: str
    variant_id: Optional[UUID]
    variant_name: Optional[str]
    warehouse_id: UUID
    warehouse_name: str
    quantity: float
    min_qty: float
    missing: float  # cuánto falta para llegar al mínimo


class StockSummary(BaseModel):
    total_products_tracked: int
    total_warehouses: int
    low_stock_count: int
    zero_stock_count: int
    low_stock_items: List[LowStockItem]
