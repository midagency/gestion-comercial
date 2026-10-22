"""
API de Caja y Tesorería.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DBSession
from app.schemas.treasury import (
    BankAccountCreate,
    BankAccountOut,
    BankAccountUpdate,
    BankTransactionCreate,
    BankTransactionListResponse,
    BankTransactionOut,
    CashMovementCreate,
    CashMovementOut,
    CashRegisterCreate,
    CashRegisterOut,
    CashRegisterUpdate,
    CashSessionClose,
    CashSessionListResponse,
    CashSessionOpen,
    CashSessionOut,
    TreasurySummary,
)
from app.services import treasury as treasury_service
from app.services.treasury import _session_out

router = APIRouter(prefix="/treasury", tags=["Caja y Tesorería"])


# ===========================================================================
# CAJAS
# ===========================================================================

@router.get(
    "/registers",
    response_model=list[CashRegisterOut],
    summary="Listar cajas",
)
async def list_registers(db: DBSession, current_user: CurrentUser):
    items = await treasury_service.list_registers(db, current_user.company_id)
    return [CashRegisterOut(**r) for r in items]


@router.post(
    "/registers",
    response_model=CashRegisterOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear caja",
)
async def create_register(
    data: CashRegisterCreate, db: DBSession, current_user: CurrentUser
):
    reg = await treasury_service.create_register(db, current_user.company_id, data)
    return CashRegisterOut(
        id=reg.id,
        company_id=reg.company_id,
        branch_id=reg.branch_id,
        name=reg.name,
        code=reg.code,
        is_active=reg.is_active,
        created_at=reg.created_at,
        open_session_id=None,
    )


@router.patch(
    "/registers/{register_id}",
    response_model=CashRegisterOut,
    summary="Actualizar caja",
)
async def update_register(
    register_id: UUID,
    data: CashRegisterUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    reg = await treasury_service.get_register(db, current_user.company_id, register_id)
    if not reg:
        raise HTTPException(status_code=404, detail="Caja no encontrada")
    reg = await treasury_service.update_register(db, reg, data)
    items = await treasury_service.list_registers(db, current_user.company_id)
    match = next((r for r in items if r["id"] == reg.id), None)
    return CashRegisterOut(**match) if match else CashRegisterOut.model_validate(reg)


# ===========================================================================
# SESIONES
# ===========================================================================

@router.post(
    "/sessions/open",
    response_model=CashSessionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Abrir sesión de caja",
)
async def open_session(
    data: CashSessionOpen, db: DBSession, current_user: CurrentUser
):
    try:
        session = await treasury_service.open_session(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CashSessionOut(**_session_out(session))


@router.post(
    "/sessions/{session_id}/close",
    response_model=CashSessionOut,
    summary="Cerrar sesión de caja",
    description="Calcula expected_amount (apertura + ingresos - egresos) y diferencia con el efectivo contado.",
)
async def close_session(
    session_id: UUID,
    data: CashSessionClose,
    db: DBSession,
    current_user: CurrentUser,
):
    try:
        session = await treasury_service.close_session(
            db, current_user.company_id, current_user.id, session_id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CashSessionOut(**_session_out(session))


@router.get(
    "/sessions",
    response_model=CashSessionListResponse,
    summary="Listar sesiones de caja",
)
async def list_sessions(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    register_id: Optional[UUID] = None,
    status: Optional[str] = Query(None, pattern="^(open|closed)$"),
):
    result = await treasury_service.list_sessions(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        register_id=register_id,
        status=status,
    )
    return CashSessionListResponse(
        items=[CashSessionOut(**_session_out(s)) for s in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get(
    "/sessions/{session_id}",
    response_model=CashSessionOut,
    summary="Detalle de sesión (con movimientos)",
)
async def get_session(
    session_id: UUID, db: DBSession, current_user: CurrentUser
):
    session = await treasury_service.get_session(
        db, current_user.company_id, session_id
    )
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return CashSessionOut(**_session_out(session))


@router.post(
    "/movements",
    response_model=CashMovementOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar movimiento manual de caja",
    description="Ingreso o egreso dentro de una sesión abierta (depósito, retiro, ajuste, etc.).",
)
async def add_movement(
    data: CashMovementCreate, db: DBSession, current_user: CurrentUser
):
    try:
        movement = await treasury_service.add_cash_movement(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CashMovementOut.model_validate(movement)


# ===========================================================================
# CUENTAS BANCARIAS
# ===========================================================================

@router.get(
    "/bank-accounts",
    response_model=list[BankAccountOut],
    summary="Listar cuentas bancarias",
)
async def list_bank_accounts(
    db: DBSession,
    current_user: CurrentUser,
    is_active: Optional[bool] = Query(True),
):
    accounts = await treasury_service.list_bank_accounts(
        db, current_user.company_id, is_active=is_active
    )
    return [BankAccountOut.model_validate(a) for a in accounts]


@router.post(
    "/bank-accounts",
    response_model=BankAccountOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear cuenta bancaria",
)
async def create_bank_account(
    data: BankAccountCreate, db: DBSession, current_user: CurrentUser
):
    acc = await treasury_service.create_bank_account(
        db, current_user.company_id, data
    )
    return BankAccountOut.model_validate(acc)


@router.get(
    "/bank-accounts/{account_id}",
    response_model=BankAccountOut,
    summary="Detalle de cuenta bancaria",
)
async def get_bank_account(
    account_id: UUID, db: DBSession, current_user: CurrentUser
):
    acc = await treasury_service.get_bank_account(
        db, current_user.company_id, account_id
    )
    if not acc:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return BankAccountOut.model_validate(acc)


@router.patch(
    "/bank-accounts/{account_id}",
    response_model=BankAccountOut,
    summary="Actualizar cuenta bancaria",
)
async def update_bank_account(
    account_id: UUID,
    data: BankAccountUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    acc = await treasury_service.get_bank_account(
        db, current_user.company_id, account_id
    )
    if not acc:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    acc = await treasury_service.update_bank_account(db, acc, data)
    return BankAccountOut.model_validate(acc)


@router.post(
    "/bank-transactions",
    response_model=BankTransactionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar movimiento bancario",
    description="deposit, withdrawal, transfer_in/out, fee, adjustment. Actualiza el saldo de la cuenta.",
)
async def create_bank_transaction(
    data: BankTransactionCreate, db: DBSession, current_user: CurrentUser
):
    try:
        tx = await treasury_service.create_bank_transaction(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return BankTransactionOut.model_validate(tx)


@router.get(
    "/bank-transactions",
    response_model=BankTransactionListResponse,
    summary="Listar movimientos bancarios",
)
async def list_bank_transactions(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    account_id: Optional[UUID] = None,
):
    result = await treasury_service.list_bank_transactions(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        account_id=account_id,
    )
    return BankTransactionListResponse(
        items=[BankTransactionOut.model_validate(t) for t in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


# ===========================================================================
# RESUMEN
# ===========================================================================

@router.get(
    "/summary",
    response_model=TreasurySummary,
    summary="Resumen de tesorería",
)
async def treasury_summary(db: DBSession, current_user: CurrentUser):
    data = await treasury_service.get_treasury_summary(db, current_user.company_id)
    return TreasurySummary(**data)
