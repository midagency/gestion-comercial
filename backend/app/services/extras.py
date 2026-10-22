"""Servicios de CRM, lotes, BOM, comisiones, monedas, adjuntos y OT."""

from datetime import date
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.extras import (
    Activity,
    Attachment,
    BillOfMaterials,
    BomLine,
    CommissionEntry,
    CommissionRule,
    CurrencyRate,
    Opportunity,
    PaymentProviderConfig,
    ProductionOrder,
    StockLot,
    StockSerial,
    WorkOrder,
)
from app.models.inventory import StockMove
from app.models.product import Product
from app.models.sales import Invoice
from app.schemas.extras import (
    ActivityCreate,
    AttachmentCreate,
    BomCreate,
    CommissionRuleCreate,
    CurrencyRateCreate,
    OpportunityCreate,
    OpportunityUpdate,
    PaymentProviderCreate,
    ProductionOrderCreate,
    StockLotCreate,
    StockSerialCreate,
    WorkOrderCreate,
    WorkOrderUpdate,
)
from app.services.inventory import _apply_quantity_change, _get_or_create_stock_level
from app.services.sales import _next_number


# ---- CRM ----

async def list_opportunities(
    db: AsyncSession, company_id: UUID, stage: Optional[str] = None
) -> list[Opportunity]:
    q = select(Opportunity).where(Opportunity.company_id == company_id)
    if stage:
        q = q.where(Opportunity.stage == stage)
    q = q.order_by(Opportunity.updated_at.desc())
    return list((await db.execute(q)).scalars().all())


async def create_opportunity(
    db: AsyncSession, company_id: UUID, data: OpportunityCreate
) -> Opportunity:
    opp = Opportunity(company_id=company_id, **data.model_dump())
    db.add(opp)
    await db.flush()
    await db.refresh(opp)
    return opp


async def update_opportunity(
    db: AsyncSession, opp: Opportunity, data: OpportunityUpdate
) -> Opportunity:
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(opp, k, v)
    await db.flush()
    await db.refresh(opp)
    return opp


async def list_activities(
    db: AsyncSession, company_id: UUID, status: Optional[str] = None
) -> list[Activity]:
    q = select(Activity).where(Activity.company_id == company_id)
    if status:
        q = q.where(Activity.status == status)
    q = q.order_by(Activity.due_date.nulls_last(), Activity.created_at.desc()).limit(100)
    return list((await db.execute(q)).scalars().all())


async def create_activity(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: ActivityCreate
) -> Activity:
    act = Activity(company_id=company_id, created_by=user_id, **data.model_dump())
    db.add(act)
    await db.flush()
    await db.refresh(act)
    return act


async def complete_activity(db: AsyncSession, company_id: UUID, activity_id: UUID) -> Activity:
    r = await db.execute(
        select(Activity).where(Activity.id == activity_id, Activity.company_id == company_id)
    )
    act = r.scalar_one_or_none()
    if not act:
        raise ValueError("Actividad no encontrada")
    act.status = "done"
    await db.flush()
    return act


# ---- Lots / serials ----

async def create_lot(db: AsyncSession, company_id: UUID, data: StockLotCreate) -> StockLot:
    lot = StockLot(company_id=company_id, **data.model_dump())
    db.add(lot)
    await db.flush()
    await db.refresh(lot)
    return lot


async def list_lots(
    db: AsyncSession,
    company_id: UUID,
    product_id: Optional[UUID] = None,
    expiring_days: Optional[int] = None,
) -> list[StockLot]:
    q = select(StockLot).where(StockLot.company_id == company_id)
    if product_id:
        q = q.where(StockLot.product_id == product_id)
    if expiring_days is not None:
        limit = date.today().toordinal() + expiring_days  # simple filter below
        from datetime import timedelta
        q = q.where(
            StockLot.expiry_date.is_not(None),
            StockLot.expiry_date <= date.today() + timedelta(days=expiring_days),
        )
    q = q.order_by(StockLot.expiry_date.nulls_last())
    return list((await db.execute(q)).scalars().all())


async def create_serial(
    db: AsyncSession, company_id: UUID, data: StockSerialCreate
) -> StockSerial:
    exists = await db.execute(
        select(StockSerial).where(
            StockSerial.company_id == company_id,
            StockSerial.serial_number == data.serial_number,
        )
    )
    if exists.scalar_one_or_none():
        raise ValueError("Número de serie ya existe")
    s = StockSerial(company_id=company_id, **data.model_dump())
    db.add(s)
    await db.flush()
    await db.refresh(s)
    return s


async def list_serials(
    db: AsyncSession,
    company_id: UUID,
    product_id: Optional[UUID] = None,
    status: Optional[str] = None,
) -> list[StockSerial]:
    q = select(StockSerial).where(StockSerial.company_id == company_id)
    if product_id:
        q = q.where(StockSerial.product_id == product_id)
    if status:
        q = q.where(StockSerial.status == status)
    return list((await db.execute(q.order_by(StockSerial.created_at.desc()).limit(200))).scalars().all())


# ---- BOM / Production ----

async def create_bom(db: AsyncSession, company_id: UUID, data: BomCreate) -> BillOfMaterials:
    prod = await db.execute(
        select(Product).where(Product.id == data.product_id, Product.company_id == company_id)
    )
    if not prod.scalar_one_or_none():
        raise ValueError("Producto terminado no encontrado")
    bom = BillOfMaterials(
        company_id=company_id,
        product_id=data.product_id,
        name=data.name,
        quantity=data.quantity,
    )
    db.add(bom)
    await db.flush()
    for ln in data.lines:
        db.add(BomLine(bom_id=bom.id, component_id=ln.component_id, quantity=ln.quantity))
    await db.flush()
    await db.refresh(bom, attribute_names=["lines"])
    return bom


async def list_boms(db: AsyncSession, company_id: UUID) -> list[BillOfMaterials]:
    r = await db.execute(
        select(BillOfMaterials)
        .options(selectinload(BillOfMaterials.lines))
        .where(BillOfMaterials.company_id == company_id, BillOfMaterials.is_active == True)  # noqa: E712
        .order_by(BillOfMaterials.name)
    )
    return list(r.scalars().unique().all())


async def create_production_order(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: ProductionOrderCreate
) -> ProductionOrder:
    bom_r = await db.execute(
        select(BillOfMaterials)
        .options(selectinload(BillOfMaterials.lines))
        .where(BillOfMaterials.id == data.bom_id, BillOfMaterials.company_id == company_id)
    )
    bom = bom_r.scalar_one_or_none()
    if not bom:
        raise ValueError("BOM no encontrada")
    number = await _next_number(db, company_id, "OP", ProductionOrder, "order_number")
    po = ProductionOrder(
        company_id=company_id,
        bom_id=bom.id,
        product_id=bom.product_id,
        warehouse_id=data.warehouse_id,
        order_number=number,
        quantity=data.quantity,
        planned_date=data.planned_date,
        notes=data.notes,
        created_by=user_id,
        status="draft",
    )
    db.add(po)
    await db.flush()
    await db.refresh(po)
    return po


async def complete_production(
    db: AsyncSession, company_id: UUID, user_id: UUID, order_id: UUID
) -> ProductionOrder:
    """Consume componentes y produce el producto terminado."""
    r = await db.execute(
        select(ProductionOrder).where(
            ProductionOrder.id == order_id, ProductionOrder.company_id == company_id
        )
    )
    po = r.scalar_one_or_none()
    if not po:
        raise ValueError("Orden de producción no encontrada")
    if po.status not in ("draft", "in_progress"):
        raise ValueError("Estado inválido")

    bom_r = await db.execute(
        select(BillOfMaterials)
        .options(selectinload(BillOfMaterials.lines))
        .where(BillOfMaterials.id == po.bom_id)
    )
    bom = bom_r.scalar_one()
    warehouse_id = po.warehouse_id
    if not warehouse_id:
        from app.models.company import Warehouse
        wh = await db.execute(
            select(Warehouse).where(
                Warehouse.company_id == company_id,
                Warehouse.is_main == True,  # noqa: E712
            )
        )
        w = wh.scalar_one_or_none()
        if not w:
            raise ValueError("Sin almacén")
        warehouse_id = w.id

    factor = float(po.quantity) / float(bom.quantity or 1)

    # Consume components
    for ln in bom.lines:
        qty = float(ln.quantity) * factor
        level = await _get_or_create_stock_level(
            db, company_id, warehouse_id, ln.component_id, None
        )
        if float(level.quantity) < qty:
            raise ValueError(f"Stock insuficiente del componente {ln.component_id}")
        await _apply_quantity_change(db, level, -qty)
        db.add(
            StockMove(
                company_id=company_id,
                warehouse_id=warehouse_id,
                product_id=ln.component_id,
                move_type="out",
                quantity=qty,
                reference_type="production_order",
                reference_id=po.id,
                notes=f"Consumo OP {po.order_number}",
                created_by=user_id,
            )
        )

    # Produce finished good
    level = await _get_or_create_stock_level(
        db, company_id, warehouse_id, po.product_id, None
    )
    await _apply_quantity_change(db, level, float(po.quantity))
    db.add(
        StockMove(
            company_id=company_id,
            warehouse_id=warehouse_id,
            product_id=po.product_id,
            move_type="in",
            quantity=float(po.quantity),
            reference_type="production_order",
            reference_id=po.id,
            notes=f"Producción OP {po.order_number}",
            created_by=user_id,
        )
    )
    po.status = "done"
    await db.flush()
    await db.refresh(po)
    return po


async def list_production_orders(db: AsyncSession, company_id: UUID) -> list[ProductionOrder]:
    r = await db.execute(
        select(ProductionOrder)
        .where(ProductionOrder.company_id == company_id)
        .order_by(ProductionOrder.created_at.desc())
        .limit(50)
    )
    return list(r.scalars().all())


# ---- Commissions ----

async def create_commission_rule(
    db: AsyncSession, company_id: UUID, data: CommissionRuleCreate
) -> CommissionRule:
    rule = CommissionRule(company_id=company_id, **data.model_dump())
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def list_commission_rules(db: AsyncSession, company_id: UUID) -> list[CommissionRule]:
    r = await db.execute(
        select(CommissionRule).where(
            CommissionRule.company_id == company_id,
            CommissionRule.is_active == True,  # noqa: E712
        )
    )
    return list(r.scalars().all())


async def calculate_commissions_for_invoice(
    db: AsyncSession, company_id: UUID, invoice_id: UUID
) -> list[CommissionEntry]:
    inv_r = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id, Invoice.company_id == company_id)
    )
    inv = inv_r.scalar_one_or_none()
    if not inv:
        raise ValueError("Factura no encontrada")

    # salesperson from related sale order if any
    salesperson_id = None
    if inv.sale_order_id:
        from app.models.sales import SaleOrder
        so = await db.execute(select(SaleOrder).where(SaleOrder.id == inv.sale_order_id))
        order = so.scalar_one_or_none()
        if order:
            salesperson_id = order.salesperson_id

    rules = await list_commission_rules(db, company_id)
    entries: list[CommissionEntry] = []
    period = inv.invoice_date.strftime("%Y-%m") if inv.invoice_date else None
    base = float(inv.total)

    for rule in rules:
        if rule.salesperson_id and salesperson_id and rule.salesperson_id != salesperson_id:
            continue
        target_sp = rule.salesperson_id or salesperson_id
        if not target_sp:
            continue
        if rule.rule_type == "percent_of_sale":
            amount = round(base * float(rule.rate) / 100, 2)
        elif rule.rule_type == "fixed":
            amount = float(rule.rate)
        else:
            amount = round(float(inv.amount_paid) * float(rule.rate) / 100, 2)
        entry = CommissionEntry(
            company_id=company_id,
            salesperson_id=target_sp,
            rule_id=rule.id,
            invoice_id=inv.id,
            base_amount=base,
            commission_amount=amount,
            status="pending",
            period=period,
        )
        db.add(entry)
        entries.append(entry)
    await db.flush()
    return entries


async def list_commission_entries(
    db: AsyncSession, company_id: UUID, period: Optional[str] = None
) -> list[CommissionEntry]:
    q = select(CommissionEntry).where(CommissionEntry.company_id == company_id)
    if period:
        q = q.where(CommissionEntry.period == period)
    q = q.order_by(CommissionEntry.created_at.desc()).limit(100)
    return list((await db.execute(q)).scalars().all())


# ---- Currency ----

async def upsert_rate(
    db: AsyncSession, company_id: UUID, data: CurrencyRateCreate
) -> CurrencyRate:
    rd = data.rate_date or date.today()
    existing = await db.execute(
        select(CurrencyRate).where(
            CurrencyRate.company_id == company_id,
            CurrencyRate.from_currency == data.from_currency.upper(),
            CurrencyRate.to_currency == data.to_currency.upper(),
            CurrencyRate.rate_date == rd,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        row.rate = data.rate
        await db.flush()
        await db.refresh(row)
        return row
    rate = CurrencyRate(
        company_id=company_id,
        from_currency=data.from_currency.upper(),
        to_currency=data.to_currency.upper(),
        rate=data.rate,
        rate_date=rd,
    )
    db.add(rate)
    await db.flush()
    await db.refresh(rate)
    return rate


async def list_rates(db: AsyncSession, company_id: UUID) -> list[CurrencyRate]:
    r = await db.execute(
        select(CurrencyRate)
        .where(CurrencyRate.company_id == company_id)
        .order_by(CurrencyRate.rate_date.desc())
        .limit(50)
    )
    return list(r.scalars().all())


async def convert_amount(
    db: AsyncSession,
    company_id: UUID,
    amount: float,
    from_currency: str,
    to_currency: str,
) -> dict:
    if from_currency.upper() == to_currency.upper():
        return {"amount": amount, "rate": 1.0, "from": from_currency, "to": to_currency}
    r = await db.execute(
        select(CurrencyRate)
        .where(
            CurrencyRate.company_id == company_id,
            CurrencyRate.from_currency == from_currency.upper(),
            CurrencyRate.to_currency == to_currency.upper(),
        )
        .order_by(CurrencyRate.rate_date.desc())
        .limit(1)
    )
    rate_row = r.scalar_one_or_none()
    if not rate_row:
        # try inverse
        r2 = await db.execute(
            select(CurrencyRate)
            .where(
                CurrencyRate.company_id == company_id,
                CurrencyRate.from_currency == to_currency.upper(),
                CurrencyRate.to_currency == from_currency.upper(),
            )
            .order_by(CurrencyRate.rate_date.desc())
            .limit(1)
        )
        inv = r2.scalar_one_or_none()
        if not inv:
            raise ValueError("No hay cotización para ese par de monedas")
        rate = 1.0 / float(inv.rate)
    else:
        rate = float(rate_row.rate)
    return {
        "amount": round(amount * rate, 4),
        "rate": rate,
        "from": from_currency.upper(),
        "to": to_currency.upper(),
    }


# ---- Attachments ----

async def create_attachment(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: AttachmentCreate
) -> Attachment:
    att = Attachment(
        company_id=company_id,
        uploaded_by=user_id,
        **data.model_dump(),
    )
    db.add(att)
    await db.flush()
    await db.refresh(att)
    return att


async def list_attachments(
    db: AsyncSession, company_id: UUID, entity_type: str, entity_id: UUID
) -> list[Attachment]:
    r = await db.execute(
        select(Attachment).where(
            Attachment.company_id == company_id,
            Attachment.entity_type == entity_type,
            Attachment.entity_id == entity_id,
        )
    )
    return list(r.scalars().all())


# ---- Work orders ----

async def create_work_order(
    db: AsyncSession, company_id: UUID, user_id: UUID, data: WorkOrderCreate
) -> WorkOrder:
    number = await _next_number(db, company_id, "OT", WorkOrder, "order_number")
    wo = WorkOrder(
        company_id=company_id,
        order_number=number,
        created_by=user_id,
        **data.model_dump(),
    )
    db.add(wo)
    await db.flush()
    await db.refresh(wo)
    return wo


async def list_work_orders(
    db: AsyncSession, company_id: UUID, status: Optional[str] = None
) -> list[WorkOrder]:
    q = select(WorkOrder).where(WorkOrder.company_id == company_id)
    if status:
        q = q.where(WorkOrder.status == status)
    q = q.order_by(WorkOrder.created_at.desc()).limit(50)
    return list((await db.execute(q)).scalars().all())


async def update_work_order(
    db: AsyncSession, company_id: UUID, order_id: UUID, data: WorkOrderUpdate
) -> WorkOrder:
    r = await db.execute(
        select(WorkOrder).where(WorkOrder.id == order_id, WorkOrder.company_id == company_id)
    )
    wo = r.scalar_one_or_none()
    if not wo:
        raise ValueError("OT no encontrada")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(wo, k, v)
    if data.status == "done" and not wo.completed_at:
        from datetime import datetime, timezone
        wo.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(wo)
    return wo


# ---- Payment providers ----

async def upsert_payment_provider(
    db: AsyncSession, company_id: UUID, data: PaymentProviderCreate
) -> PaymentProviderConfig:
    r = await db.execute(
        select(PaymentProviderConfig).where(
            PaymentProviderConfig.company_id == company_id,
            PaymentProviderConfig.provider == data.provider,
        )
    )
    row = r.scalar_one_or_none()
    hint = None
    if data.access_token:
        hint = data.access_token[-4:] if len(data.access_token) >= 4 else "****"
    if row:
        row.is_active = data.is_active
        row.public_key = data.public_key
        if hint:
            row.access_token_hint = hint
        if data.settings_json is not None:
            row.settings_json = data.settings_json
        await db.flush()
        await db.refresh(row)
        return row
    cfg = PaymentProviderConfig(
        company_id=company_id,
        provider=data.provider,
        is_active=data.is_active,
        public_key=data.public_key,
        access_token_hint=hint,
        settings_json=data.settings_json,
    )
    db.add(cfg)
    await db.flush()
    await db.refresh(cfg)
    return cfg


async def list_payment_providers(
    db: AsyncSession, company_id: UUID
) -> list[PaymentProviderConfig]:
    r = await db.execute(
        select(PaymentProviderConfig).where(PaymentProviderConfig.company_id == company_id)
    )
    return list(r.scalars().all())
