"""Servicios de plan de cuentas, asientos, cheques y notificaciones."""

from datetime import date, datetime, timedelta
from math import ceil
from typing import Optional
from uuid import UUID
import random
import string

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.accounting import Account, Check, JournalEntry, JournalEntryLine, Notification
from app.models.sales import Invoice
from app.schemas.accounting import (
    AccountCreate,
    CheckCreate,
    CheckStatusUpdate,
    EInvoiceRequest,
    JournalEntryCreate,
)
from app.services.sales import _next_number


DEFAULT_CHART = [
    ("1", "ACTIVO", "asset"),
    ("1.1", "Caja y bancos", "asset"),
    ("1.1.01", "Caja", "asset"),
    ("1.1.02", "Banco cuenta corriente", "asset"),
    ("1.2", "Créditos", "asset"),
    ("1.2.01", "Deudores por ventas", "asset"),
    ("1.3", "Bienes de cambio", "asset"),
    ("1.3.01", "Mercaderías", "asset"),
    ("2", "PASIVO", "liability"),
    ("2.1", "Deudas comerciales", "liability"),
    ("2.1.01", "Proveedores", "liability"),
    ("2.2", "Deudas fiscales", "liability"),
    ("2.2.01", "IVA a pagar", "liability"),
    ("3", "PATRIMONIO NETO", "equity"),
    ("3.1", "Capital", "equity"),
    ("3.1.01", "Capital social", "equity"),
    ("4", "INGRESOS", "income"),
    ("4.1", "Ventas", "income"),
    ("4.1.01", "Ventas de mercaderías", "income"),
    ("5", "EGRESOS", "expense"),
    ("5.1", "Costo de mercaderías", "expense"),
    ("5.1.01", "CMV", "expense"),
    ("5.2", "Gastos", "expense"),
    ("5.2.01", "Gastos generales", "expense"),
]


async def seed_chart_of_accounts(db: AsyncSession, company_id: UUID) -> list[Account]:
    existing = await db.execute(
        select(func.count()).select_from(Account).where(Account.company_id == company_id)
    )
    if (existing.scalar() or 0) > 0:
        result = await db.execute(
            select(Account).where(Account.company_id == company_id).order_by(Account.code)
        )
        return list(result.scalars().all())

    created: list[Account] = []
    code_to_id: dict[str, UUID] = {}
    for code, name, atype in DEFAULT_CHART:
        parent_id = None
        if "." in code:
            parent_code = code.rsplit(".", 1)[0]
            # try hierarchical parent: 1.1.01 -> 1.1 -> 1
            while parent_code and parent_code not in code_to_id:
                if "." not in parent_code:
                    break
                parent_code = parent_code.rsplit(".", 1)[0]
            parent_id = code_to_id.get(parent_code)
        acc = Account(
            company_id=company_id,
            code=code,
            name=name,
            account_type=atype,
            parent_id=parent_id,
        )
        db.add(acc)
        await db.flush()
        code_to_id[code] = acc.id
        created.append(acc)
    return created


async def list_accounts(db: AsyncSession, company_id: UUID) -> list[Account]:
    result = await db.execute(
        select(Account)
        .where(Account.company_id == company_id, Account.is_active == True)  # noqa: E712
        .order_by(Account.code)
    )
    return list(result.scalars().all())


async def create_account(
    db: AsyncSession, company_id: UUID, data: AccountCreate
) -> Account:
    exists = await db.execute(
        select(Account).where(
            Account.company_id == company_id, Account.code == data.code
        )
    )
    if exists.scalar_one_or_none():
        raise ValueError(f"Ya existe la cuenta {data.code}")
    acc = Account(company_id=company_id, **data.model_dump())
    db.add(acc)
    await db.flush()
    await db.refresh(acc)
    return acc


async def create_journal_entry(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: JournalEntryCreate
) -> JournalEntry:
    for ln in data.lines:
        acc = await db.execute(
            select(Account).where(
                Account.id == ln.account_id, Account.company_id == company_id
            )
        )
        if not acc.scalar_one_or_none():
            raise ValueError(f"Cuenta {ln.account_id} no encontrada")

    number = await _next_number(db, company_id, "ASI", JournalEntry, "entry_number")
    entry = JournalEntry(
        company_id=company_id,
        entry_number=number,
        entry_date=data.entry_date or date.today(),
        description=data.description,
        status="posted",
        created_by=user_id,
    )
    db.add(entry)
    await db.flush()
    for ln in data.lines:
        db.add(
            JournalEntryLine(
                entry_id=entry.id,
                account_id=ln.account_id,
                description=ln.description,
                debit=ln.debit,
                credit=ln.credit,
            )
        )
    await db.flush()
    await db.refresh(entry, attribute_names=["lines"])
    return entry


async def list_journal_entries(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    base = (
        select(JournalEntry)
        .options(selectinload(JournalEntry.lines))
        .where(JournalEntry.company_id == company_id)
    )
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    result = await db.execute(
        base.order_by(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = result.scalars().unique().all()
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def trial_balance(db: AsyncSession, company_id: UUID) -> list[dict]:
    """Sumas y saldos por cuenta (solo asientos posted)."""
    q = (
        select(
            Account.id,
            Account.code,
            Account.name,
            Account.account_type,
            func.coalesce(func.sum(JournalEntryLine.debit), 0).label("debit"),
            func.coalesce(func.sum(JournalEntryLine.credit), 0).label("credit"),
        )
        .outerjoin(JournalEntryLine, JournalEntryLine.account_id == Account.id)
        .outerjoin(
            JournalEntry,
            (JournalEntry.id == JournalEntryLine.entry_id)
            & (JournalEntry.status == "posted")
            & (JournalEntry.company_id == company_id),
        )
        .where(Account.company_id == company_id, Account.is_active == True)  # noqa: E712
        .group_by(Account.id, Account.code, Account.name, Account.account_type)
        .order_by(Account.code)
    )
    rows = (await db.execute(q)).all()
    out = []
    for r in rows:
        debit = float(r.debit)
        credit = float(r.credit)
        out.append(
            {
                "account_id": r.id,
                "code": r.code,
                "name": r.name,
                "account_type": r.account_type,
                "debit": debit,
                "credit": credit,
                "balance": debit - credit,
            }
        )
    return out


# ---- Cheques ----

async def create_check(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: CheckCreate
) -> Check:
    chk = Check(
        company_id=company_id,
        created_by=user_id,
        issue_date=data.issue_date or date.today(),
        **data.model_dump(exclude={"issue_date"}),
    )
    db.add(chk)
    await db.flush()
    await db.refresh(chk)
    return chk


async def list_checks(
    db: AsyncSession,
    company_id: UUID,
    *,
    check_kind: Optional[str] = None,
    status: Optional[str] = None,
) -> list[Check]:
    q = select(Check).where(Check.company_id == company_id)
    if check_kind:
        q = q.where(Check.check_kind == check_kind)
    if status:
        q = q.where(Check.status == status)
    q = q.order_by(Check.due_date.nulls_last(), Check.created_at.desc())
    return list((await db.execute(q)).scalars().all())


async def update_check_status(
    db: AsyncSession, company_id: UUID, check_id: UUID, data: CheckStatusUpdate
) -> Check:
    """
    deposited (depositar) → suma el monto a la cuenta banco.
    cleared (acreditar / debitar propio) → resta el monto de la cuenta banco.
    """
    result = await db.execute(
        select(Check).where(Check.id == check_id, Check.company_id == company_id)
    )
    chk = result.scalar_one_or_none()
    if not chk:
        raise ValueError("Cheque no encontrado")

    new_status = data.status
    bank_account_id = data.bank_account_id or chk.bank_account_id

    if new_status in ("deposited", "cleared"):
        if not bank_account_id:
            raise ValueError("Seleccioná la cuenta bancaria")
        from app.models.treasury import BankAccount, BankTransaction

        ba = (
            await db.execute(
                select(BankAccount).where(
                    BankAccount.id == bank_account_id,
                    BankAccount.company_id == company_id,
                )
            )
        ).scalar_one_or_none()
        if not ba:
            raise ValueError("Cuenta bancaria no encontrada")

        if new_status == "deposited":
            # Cheque de terceros depositado → ingreso
            ba.current_balance = float(ba.current_balance or 0) + float(chk.amount)
            db.add(
                BankTransaction(
                    company_id=company_id,
                    account_id=ba.id,
                    transaction_type="deposit",
                    direction="income",
                    amount=chk.amount,
                    transaction_date=date.today(),
                    description=f"Depósito cheque {chk.check_number}",
                    reference=chk.check_number,
                    reference_type="check",
                    reference_id=chk.id,
                )
            )
        elif new_status == "cleared":
            # Acreditación / débito del cheque → egreso de la cuenta
            if float(ba.current_balance or 0) < float(chk.amount):
                raise ValueError(
                    f"Saldo insuficiente ({ba.current_balance}) para acreditar cheque {chk.amount}"
                )
            ba.current_balance = float(ba.current_balance or 0) - float(chk.amount)
            db.add(
                BankTransaction(
                    company_id=company_id,
                    account_id=ba.id,
                    transaction_type="withdrawal",
                    direction="expense",
                    amount=chk.amount,
                    transaction_date=date.today(),
                    description=f"Acreditación cheque {chk.check_number}",
                    reference=chk.check_number,
                    reference_type="check",
                    reference_id=chk.id,
                )
            )
        chk.bank_account_id = bank_account_id

    chk.status = new_status
    await db.flush()
    await db.refresh(chk)
    return chk


# ---- E-invoice (simulado AFIP) ----

async def authorize_invoice(
    db: AsyncSession,
    company_id: UUID,
    invoice_id: UUID,
    data: EInvoiceRequest,
) -> Invoice:
    result = await db.execute(
        select(Invoice).where(
            Invoice.id == invoice_id,
            Invoice.company_id == company_id,
            Invoice.invoice_type == "invoice",
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise ValueError("Factura no encontrada")
    if inv.status == "cancelled":
        raise ValueError("No se puede autorizar una factura cancelada")
    if inv.cae:
        raise ValueError("La factura ya tiene CAE")

    if data.simulate:
        cae = "".join(random.choices(string.digits, k=14))
        inv.cae = cae
        inv.cae_due_date = date.today() + timedelta(days=10)
        inv.fiscal_status = "simulated"
        inv.fiscal_point_of_sale = data.point_of_sale
        inv.fiscal_voucher_type = data.voucher_type
        if inv.status == "draft":
            inv.status = "posted"
    else:
        # Placeholder para integración real AFIP WSFE
        inv.fiscal_status = "pending"
        inv.fiscal_point_of_sale = data.point_of_sale
        inv.fiscal_voucher_type = data.voucher_type
        raise ValueError(
            "Integración AFIP real no configurada. Usá simulate=true para CAE de prueba."
        )

    await db.flush()
    await db.refresh(inv)
    return inv


# ---- Notifications ----

async def create_notification(
    db: AsyncSession,
    company_id: UUID,
    title: str,
    body: Optional[str] = None,
    level: str = "info",
    link: Optional[str] = None,
    user_id: Optional[UUID] = None,
) -> Notification:
    n = Notification(
        company_id=company_id,
        user_id=user_id,
        title=title,
        body=body,
        level=level,
        link=link,
    )
    db.add(n)
    await db.flush()
    return n


async def list_notifications(
    db: AsyncSession,
    company_id: UUID,
    user_id: UUID,
    *,
    unread_only: bool = False,
) -> list[Notification]:
    q = select(Notification).where(
        Notification.company_id == company_id,
        (Notification.user_id == user_id) | (Notification.user_id.is_(None)),
    )
    if unread_only:
        q = q.where(Notification.is_read == False)  # noqa: E712
    q = q.order_by(Notification.created_at.desc()).limit(50)
    return list((await db.execute(q)).scalars().all())


async def mark_notification_read(
    db: AsyncSession, company_id: UUID, notif_id: UUID
) -> Notification:
    result = await db.execute(
        select(Notification).where(
            Notification.id == notif_id, Notification.company_id == company_id
        )
    )
    n = result.scalar_one_or_none()
    if not n:
        raise ValueError("Notificación no encontrada")
    n.is_read = True
    await db.flush()
    return n
