"""
Servicio de Caja y Tesorería.
"""

from datetime import datetime, timezone
from math import ceil
from typing import Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.treasury import (
    BankAccount,
    BankTransaction,
    CashMovement,
    CashRegister,
    CashSession,
)
from app.schemas.treasury import (
    BankAccountCreate,
    BankAccountUpdate,
    BankTransactionCreate,
    CashMovementCreate,
    CashRegisterCreate,
    CashRegisterUpdate,
    CashSessionClose,
    CashSessionOpen,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

INCOME_BANK_TYPES = {"deposit", "transfer_in", "adjustment"}
# adjustment puede ser + o - según convención: si amount > 0 y type adjustment, income
EXPENSE_BANK_TYPES = {"withdrawal", "transfer_out", "fee"}


def _session_totals(session: CashSession) -> tuple[float, float, float]:
    """income, expense, expected (opening + income - expense)."""
    income = sum(float(m.amount) for m in session.movements if m.direction == "income")
    expense = sum(float(m.amount) for m in session.movements if m.direction == "expense")
    expected = float(session.opening_amount) + income - expense
    return income, expense, expected


def _session_out(session: CashSession) -> dict:
    income, expense, expected = _session_totals(session)
    return {
        "id": session.id,
        "company_id": session.company_id,
        "register_id": session.register_id,
        "opened_by": session.opened_by,
        "closed_by": session.closed_by,
        "opened_at": session.opened_at,
        "closed_at": session.closed_at,
        "opening_amount": float(session.opening_amount),
        "expected_amount": float(session.expected_amount) if session.expected_amount is not None else expected,
        "closing_amount": float(session.closing_amount) if session.closing_amount is not None else None,
        "difference": float(session.difference) if session.difference is not None else None,
        "status": session.status,
        "notes": session.notes,
        "movements": session.movements,
        "total_income": income,
        "total_expense": expense,
    }


# ===========================================================================
# CAJAS
# ===========================================================================

async def list_registers(db: AsyncSession, company_id: UUID) -> list[dict]:
    result = await db.execute(
        select(CashRegister)
        .where(CashRegister.company_id == company_id)
        .order_by(CashRegister.name)
    )
    registers = result.scalars().all()

    # Buscar sesiones abiertas
    open_q = await db.execute(
        select(CashSession).where(
            CashSession.company_id == company_id,
            CashSession.status == "open",
        )
    )
    open_by_register = {s.register_id: s.id for s in open_q.scalars().all()}

    out = []
    for r in registers:
        out.append({
            "id": r.id,
            "company_id": r.company_id,
            "branch_id": r.branch_id,
            "name": r.name,
            "code": r.code,
            "is_active": r.is_active,
            "created_at": r.created_at,
            "open_session_id": open_by_register.get(r.id),
        })
    return out


async def get_register(
    db: AsyncSession, company_id: UUID, register_id: UUID
) -> Optional[CashRegister]:
    result = await db.execute(
        select(CashRegister).where(
            CashRegister.id == register_id,
            CashRegister.company_id == company_id,
        )
    )
    return result.scalar_one_or_none()


async def create_register(
    db: AsyncSession, company_id: UUID, data: CashRegisterCreate
) -> CashRegister:
    reg = CashRegister(company_id=company_id, **data.model_dump())
    db.add(reg)
    await db.flush()
    await db.refresh(reg)
    return reg


async def update_register(
    db: AsyncSession, register: CashRegister, data: CashRegisterUpdate
) -> CashRegister:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(register, field, value)
    await db.flush()
    await db.refresh(register)
    return register


# ===========================================================================
# SESIONES
# ===========================================================================

async def open_session(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: CashSessionOpen
) -> CashSession:
    reg = await get_register(db, company_id, data.register_id)
    if not reg or not reg.is_active:
        raise ValueError("Caja no encontrada o inactiva")

    # ¿Ya hay sesión abierta?
    existing = await db.execute(
        select(CashSession).where(
            CashSession.register_id == data.register_id,
            CashSession.status == "open",
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Esta caja ya tiene una sesión abierta. Cerrala antes de abrir otra.")

    session = CashSession(
        company_id=company_id,
        register_id=data.register_id,
        opened_by=user_id,
        opening_amount=data.opening_amount,
        status="open",
        notes=data.notes,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session, attribute_names=["movements"])
    return session


async def close_session(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    session_id: UUID,
    data: CashSessionClose,
) -> CashSession:
    result = await db.execute(
        select(CashSession)
        .options(selectinload(CashSession.movements))
        .where(CashSession.id == session_id, CashSession.company_id == company_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise ValueError("Sesión no encontrada")
    if session.status != "open":
        raise ValueError("La sesión ya está cerrada")

    _, _, expected = _session_totals(session)
    closing = data.closing_amount
    diff = closing - expected

    session.expected_amount = expected
    session.closing_amount = closing
    session.difference = diff
    session.closed_by = user_id
    session.closed_at = datetime.now(timezone.utc)
    session.status = "closed"
    if data.notes:
        session.notes = (session.notes or "") + f"\n[Cierre] {data.notes}"

    await db.flush()
    await db.refresh(session, attribute_names=["movements"])
    return session


async def get_session(
    db: AsyncSession, company_id: UUID, session_id: UUID
) -> Optional[CashSession]:
    result = await db.execute(
        select(CashSession)
        .options(selectinload(CashSession.movements))
        .where(CashSession.id == session_id, CashSession.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def list_sessions(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    register_id: Optional[UUID] = None,
    status: Optional[str] = None,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = (
        select(CashSession)
        .options(selectinload(CashSession.movements))
        .where(CashSession.company_id == company_id)
    )
    if register_id:
        base = base.where(CashSession.register_id == register_id)
    if status:
        base = base.where(CashSession.status == status)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(CashSession.opened_at.desc()).offset(offset).limit(page_size)
    )
    items = result.scalars().unique().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def add_cash_movement(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: CashMovementCreate
) -> CashMovement:
    session = await get_session(db, company_id, data.session_id)
    if not session:
        raise ValueError("Sesión no encontrada")
    if session.status != "open":
        raise ValueError("No se pueden agregar movimientos a una sesión cerrada")

    movement = CashMovement(
        company_id=company_id,
        session_id=data.session_id,
        movement_type=data.movement_type,
        direction=data.direction,
        amount=data.amount,
        payment_method=data.payment_method,
        description=data.description,
        created_by=user_id,
    )
    db.add(movement)
    await db.flush()
    await db.refresh(movement)
    return movement


async def register_sale_payment_in_cash(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    session_id: UUID,
    amount: float,
    payment_id: Optional[UUID] = None,
    description: Optional[str] = None,
) -> CashMovement:
    """Helper para que el módulo de ventas registre un cobro en efectivo."""
    session = await get_session(db, company_id, session_id)
    if not session or session.status != "open":
        raise ValueError("Sesión de caja no disponible")

    movement = CashMovement(
        company_id=company_id,
        session_id=session_id,
        movement_type="sale_payment",
        direction="income",
        amount=amount,
        payment_method="cash",
        reference_type="payment",
        reference_id=payment_id,
        description=description or "Cobro de venta",
        created_by=user_id,
    )
    db.add(movement)
    await db.flush()
    await db.refresh(movement)
    return movement


# ===========================================================================
# CUENTAS BANCARIAS
# ===========================================================================

async def list_bank_accounts(
    db: AsyncSession, company_id: UUID, *, is_active: Optional[bool] = True
) -> list[BankAccount]:
    q = select(BankAccount).where(BankAccount.company_id == company_id)
    if is_active is not None:
        q = q.where(BankAccount.is_active == is_active)
    result = await db.execute(q.order_by(BankAccount.name))
    return list(result.scalars().all())


async def get_bank_account(
    db: AsyncSession, company_id: UUID, account_id: UUID
) -> Optional[BankAccount]:
    result = await db.execute(
        select(BankAccount).where(
            BankAccount.id == account_id,
            BankAccount.company_id == company_id,
        )
    )
    return result.scalar_one_or_none()


async def create_bank_account(
    db: AsyncSession, company_id: UUID, data: BankAccountCreate
) -> BankAccount:
    acc = BankAccount(
        company_id=company_id,
        name=data.name,
        bank_name=data.bank_name,
        account_number=data.account_number,
        cbu_alias=data.cbu_alias,
        currency_code=data.currency_code,
        current_balance=data.current_balance,
        notes=data.notes,
    )
    db.add(acc)
    await db.flush()

    # Si hay saldo inicial, registrar movimiento de ajuste
    if data.current_balance and data.current_balance != 0:
        direction = "income" if data.current_balance > 0 else "expense"
        tx = BankTransaction(
            company_id=company_id,
            account_id=acc.id,
            transaction_type="adjustment",
            direction=direction,
            amount=abs(data.current_balance),
            description="Saldo inicial",
        )
        db.add(tx)

    await db.flush()
    await db.refresh(acc)
    return acc


async def update_bank_account(
    db: AsyncSession, account: BankAccount, data: BankAccountUpdate
) -> BankAccount:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await db.flush()
    await db.refresh(account)
    return account


async def create_bank_transaction(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: BankTransactionCreate
) -> BankTransaction:
    account = await get_bank_account(db, company_id, data.account_id)
    if not account or not account.is_active:
        raise ValueError("Cuenta bancaria no encontrada o inactiva")

    if data.transaction_type in EXPENSE_BANK_TYPES or (
        data.transaction_type == "adjustment" and False
    ):
        direction = "expense"
    elif data.transaction_type in ("deposit", "transfer_in"):
        direction = "income"
    elif data.transaction_type == "adjustment":
        # Por defecto adjustment positivo = income; el cliente puede usar withdrawal para restar
        direction = "income"
    else:
        direction = "expense"

    # Ajuste más claro por tipo
    if data.transaction_type in ("deposit", "transfer_in"):
        direction = "income"
    elif data.transaction_type in ("withdrawal", "transfer_out", "fee"):
        direction = "expense"
    else:  # adjustment
        direction = "income"  # se puede documentar que adjustment suma; para restar usar withdrawal

    tx = BankTransaction(
        company_id=company_id,
        account_id=data.account_id,
        transaction_type=data.transaction_type,
        direction=direction,
        amount=data.amount,
        transaction_date=data.transaction_date or datetime.now(timezone.utc).date(),
        reference=data.reference,
        description=data.description,
        created_by=user_id,
    )
    db.add(tx)

    if direction == "income":
        account.current_balance = float(account.current_balance) + data.amount
    else:
        account.current_balance = float(account.current_balance) - data.amount

    await db.flush()
    await db.refresh(tx)
    return tx


async def list_bank_transactions(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    account_id: Optional[UUID] = None,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = select(BankTransaction).where(BankTransaction.company_id == company_id)
    if account_id:
        base = base.where(BankTransaction.account_id == account_id)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(BankTransaction.transaction_date.desc(), BankTransaction.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items = result.scalars().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


# ===========================================================================
# RESUMEN
# ===========================================================================

async def get_treasury_summary(db: AsyncSession, company_id: UUID) -> dict:
    open_sessions_q = await db.execute(
        select(CashSession)
        .options(selectinload(CashSession.movements))
        .where(CashSession.company_id == company_id, CashSession.status == "open")
    )
    open_sessions = open_sessions_q.scalars().unique().all()
    total_cash = 0.0
    for s in open_sessions:
        _, _, expected = _session_totals(s)
        total_cash += expected

    reg_count = (
        await db.execute(
            select(func.count()).where(
                CashRegister.company_id == company_id,
                CashRegister.is_active == True,  # noqa: E712
            )
        )
    ).scalar() or 0

    accounts = await list_bank_accounts(db, company_id, is_active=True)
    total_bank = sum(float(a.current_balance) for a in accounts)

    return {
        "open_sessions": len(open_sessions),
        "total_cash_in_open_sessions": round(total_cash, 2),
        "bank_accounts_count": len(accounts),
        "total_bank_balance": round(total_bank, 2),
        "registers_count": reg_count,
    }
