"""
Schemas de Reportes y Dashboard.
"""

from datetime import date
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Dashboard / KPIs
# ---------------------------------------------------------------------------

class DashboardKPIs(BaseModel):
    # Ventas
    sales_today: float
    sales_this_month: float
    sales_count_this_month: int
    # Cobros
    collections_this_month: float
    # Compras
    purchases_this_month: float
    # Stock
    low_stock_count: int
    zero_stock_count: int
    # CxC / CxP
    accounts_receivable: float
    accounts_payable: float
    # Caja
    open_cash_sessions: int
    cash_in_sessions: float
    bank_balance: float


# ---------------------------------------------------------------------------
# Ventas
# ---------------------------------------------------------------------------

class SalesByPeriodItem(BaseModel):
    period: str  # YYYY-MM-DD o YYYY-MM
    orders_count: int
    subtotal: float
    tax_amount: float
    total: float


class SalesByPeriodResponse(BaseModel):
    group_by: str  # day | month
    date_from: date
    date_to: date
    items: List[SalesByPeriodItem]
    grand_total: float
    grand_count: int


class TopProductItem(BaseModel):
    product_id: UUID
    product_name: str
    sku: Optional[str]
    quantity_sold: float
    revenue: float


class TopCustomerItem(BaseModel):
    partner_id: UUID
    partner_name: str
    orders_count: int
    total: float


class SalesByProductResponse(BaseModel):
    date_from: date
    date_to: date
    items: List[TopProductItem]
    total_revenue: float


class SalesByCustomerResponse(BaseModel):
    date_from: date
    date_to: date
    items: List[TopCustomerItem]
    total_revenue: float


# ---------------------------------------------------------------------------
# Compras
# ---------------------------------------------------------------------------

class PurchasesByPeriodItem(BaseModel):
    period: str
    orders_count: int
    total: float


class PurchasesByPeriodResponse(BaseModel):
    group_by: str
    date_from: date
    date_to: date
    items: List[PurchasesByPeriodItem]
    grand_total: float
    grand_count: int


# ---------------------------------------------------------------------------
# Inventario
# ---------------------------------------------------------------------------

class InventoryValuationItem(BaseModel):
    product_id: UUID
    product_name: str
    sku: Optional[str]
    warehouse_id: UUID
    warehouse_name: str
    quantity: float
    unit_cost: float
    valuation: float


class InventoryValuationResponse(BaseModel):
    items: List[InventoryValuationItem]
    total_valuation: float
    products_count: int


class StockMovementSummaryItem(BaseModel):
    move_type: str
    count: int
    total_quantity: float


class StockMovementSummaryResponse(BaseModel):
    date_from: date
    date_to: date
    items: List[StockMovementSummaryItem]


# ---------------------------------------------------------------------------
# Cuentas por cobrar / pagar (aging)
# ---------------------------------------------------------------------------

class AgingBucket(BaseModel):
    label: str  # current, 1-30, 31-60, 61-90, 90+
    count: int
    amount: float


class AgingItem(BaseModel):
    document_id: UUID
    document_number: str
    partner_id: UUID
    partner_name: str
    document_date: date
    due_date: Optional[date]
    total: float
    amount_paid: float
    amount_due: float
    days_overdue: int
    bucket: str


class AgingReportResponse(BaseModel):
    report_type: str  # receivable | payable
    as_of: date
    buckets: List[AgingBucket]
    items: List[AgingItem]
    total_due: float


# ---------------------------------------------------------------------------
# Tesorería
# ---------------------------------------------------------------------------

class CashSessionReportItem(BaseModel):
    session_id: UUID
    register_name: str
    opened_at: str
    closed_at: Optional[str]
    opening_amount: float
    expected_amount: Optional[float]
    closing_amount: Optional[float]
    difference: Optional[float]
    status: str
    total_income: float
    total_expense: float


class CashSessionsReportResponse(BaseModel):
    date_from: date
    date_to: date
    items: List[CashSessionReportItem]
    total_difference: float
