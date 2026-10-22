"""
API de Reportes y Dashboard.
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DBSession
from app.schemas.reports import (
    AgingReportResponse,
    CashSessionsReportResponse,
    DashboardKPIs,
    InventoryValuationResponse,
    PurchasesByPeriodResponse,
    SalesByCustomerResponse,
    SalesByPeriodResponse,
    SalesByProductResponse,
    StockMovementSummaryResponse,
)
from app.services import reports as reports_service

router = APIRouter(prefix="/reports", tags=["Reportes"])


@router.get(
    "/dashboard",
    response_model=DashboardKPIs,
    summary="Dashboard de KPIs",
    description="Resumen ejecutivo: ventas, cobros, compras, stock, CxC/CxP y caja.",
)
async def dashboard(db: DBSession, current_user: CurrentUser):
    data = await reports_service.get_dashboard(db, current_user.company_id)
    return DashboardKPIs(**data)


@router.get(
    "/sales/by-period",
    response_model=SalesByPeriodResponse,
    summary="Ventas por período",
)
async def sales_by_period(
    db: DBSession,
    current_user: CurrentUser,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    group_by: str = Query("day", pattern="^(day|month)$"),
):
    data = await reports_service.sales_by_period(
        db, current_user.company_id, date_from=date_from, date_to=date_to, group_by=group_by
    )
    return SalesByPeriodResponse(**data)


@router.get(
    "/sales/by-product",
    response_model=SalesByProductResponse,
    summary="Top productos vendidos",
)
async def sales_by_product(
    db: DBSession,
    current_user: CurrentUser,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(20, ge=1, le=100),
):
    data = await reports_service.top_products(
        db, current_user.company_id, date_from=date_from, date_to=date_to, limit=limit
    )
    return SalesByProductResponse(**data)


@router.get(
    "/sales/by-customer",
    response_model=SalesByCustomerResponse,
    summary="Top clientes",
)
async def sales_by_customer(
    db: DBSession,
    current_user: CurrentUser,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(20, ge=1, le=100),
):
    data = await reports_service.top_customers(
        db, current_user.company_id, date_from=date_from, date_to=date_to, limit=limit
    )
    return SalesByCustomerResponse(**data)


@router.get(
    "/purchases/by-period",
    response_model=PurchasesByPeriodResponse,
    summary="Compras por período",
)
async def purchases_by_period(
    db: DBSession,
    current_user: CurrentUser,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    group_by: str = Query("day", pattern="^(day|month)$"),
):
    data = await reports_service.purchases_by_period(
        db, current_user.company_id, date_from=date_from, date_to=date_to, group_by=group_by
    )
    return PurchasesByPeriodResponse(**data)


@router.get(
    "/inventory/valuation",
    response_model=InventoryValuationResponse,
    summary="Valuación de inventario",
)
async def inventory_valuation(db: DBSession, current_user: CurrentUser):
    data = await reports_service.inventory_valuation(db, current_user.company_id)
    return InventoryValuationResponse(**data)


@router.get(
    "/inventory/movements-summary",
    response_model=StockMovementSummaryResponse,
    summary="Resumen de movimientos de stock",
)
async def stock_movements_summary(
    db: DBSession,
    current_user: CurrentUser,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    data = await reports_service.stock_movements_summary(
        db, current_user.company_id, date_from=date_from, date_to=date_to
    )
    return StockMovementSummaryResponse(**data)


@router.get(
    "/aging/receivable",
    response_model=AgingReportResponse,
    summary="Cuentas por cobrar (aging)",
)
async def aging_receivable(
    db: DBSession,
    current_user: CurrentUser,
    as_of: Optional[date] = None,
):
    data = await reports_service.accounts_receivable_aging(
        db, current_user.company_id, as_of=as_of
    )
    return AgingReportResponse(**data)


@router.get(
    "/aging/payable",
    response_model=AgingReportResponse,
    summary="Cuentas por pagar (aging)",
)
async def aging_payable(
    db: DBSession,
    current_user: CurrentUser,
    as_of: Optional[date] = None,
):
    data = await reports_service.accounts_payable_aging(
        db, current_user.company_id, as_of=as_of
    )
    return AgingReportResponse(**data)


@router.get(
    "/cash/sessions",
    response_model=CashSessionsReportResponse,
    summary="Reporte de sesiones de caja",
)
async def cash_sessions_report(
    db: DBSession,
    current_user: CurrentUser,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    data = await reports_service.cash_sessions_report(
        db, current_user.company_id, date_from=date_from, date_to=date_to
    )
    return CashSessionsReportResponse(**data)
