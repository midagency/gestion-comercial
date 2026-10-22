"""API de módulos de baja prioridad."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DBSession
from app.schemas.extras import (
    ActivityCreate,
    ActivityOut,
    AttachmentCreate,
    AttachmentOut,
    BomCreate,
    BomOut,
    CommissionEntryOut,
    CommissionRuleCreate,
    CommissionRuleOut,
    CurrencyRateCreate,
    CurrencyRateOut,
    OpportunityCreate,
    OpportunityOut,
    OpportunityUpdate,
    PaymentProviderCreate,
    PaymentProviderOut,
    ProductionOrderCreate,
    ProductionOrderOut,
    StockLotCreate,
    StockLotOut,
    StockSerialCreate,
    StockSerialOut,
    WorkOrderCreate,
    WorkOrderOut,
    WorkOrderUpdate,
)
from app.services import extras as extras_service

router = APIRouter(tags=["Extras"])


# ---- CRM ----

@router.get("/crm/opportunities", response_model=list[OpportunityOut])
async def list_opportunities(
    db: DBSession,
    current_user: CurrentUser,
    stage: Optional[str] = None,
):
    items = await extras_service.list_opportunities(
        db, current_user.company_id, stage=stage
    )
    return [OpportunityOut.model_validate(i) for i in items]


@router.post(
    "/crm/opportunities",
    response_model=OpportunityOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_opportunity(
    data: OpportunityCreate, db: DBSession, current_user: CurrentUser
):
    opp = await extras_service.create_opportunity(db, current_user.company_id, data)
    return OpportunityOut.model_validate(opp)


@router.patch("/crm/opportunities/{opp_id}", response_model=OpportunityOut)
async def update_opportunity(
    opp_id: UUID, data: OpportunityUpdate, db: DBSession, current_user: CurrentUser
):
    items = await extras_service.list_opportunities(db, current_user.company_id)
    opp = next((o for o in items if o.id == opp_id), None)
    if not opp:
        raise HTTPException(status_code=404, detail="Oportunidad no encontrada")
    opp = await extras_service.update_opportunity(db, opp, data)
    return OpportunityOut.model_validate(opp)


@router.get("/crm/activities", response_model=list[ActivityOut])
async def list_activities(
    db: DBSession, current_user: CurrentUser, status: Optional[str] = None
):
    items = await extras_service.list_activities(
        db, current_user.company_id, status=status
    )
    return [ActivityOut.model_validate(i) for i in items]


@router.post(
    "/crm/activities", response_model=ActivityOut, status_code=status.HTTP_201_CREATED
)
async def create_activity(
    data: ActivityCreate, db: DBSession, current_user: CurrentUser
):
    act = await extras_service.create_activity(
        db, current_user.company_id, current_user.id, data
    )
    return ActivityOut.model_validate(act)


@router.post("/crm/activities/{activity_id}/complete", response_model=ActivityOut)
async def complete_activity(
    activity_id: UUID, db: DBSession, current_user: CurrentUser
):
    try:
        act = await extras_service.complete_activity(
            db, current_user.company_id, activity_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ActivityOut.model_validate(act)


# ---- Lots / serials ----

@router.get("/lots", response_model=list[StockLotOut])
async def list_lots(
    db: DBSession,
    current_user: CurrentUser,
    product_id: Optional[UUID] = None,
    expiring_days: Optional[int] = Query(None, ge=1, le=365),
):
    items = await extras_service.list_lots(
        db, current_user.company_id, product_id=product_id, expiring_days=expiring_days
    )
    return [StockLotOut.model_validate(i) for i in items]


@router.post("/lots", response_model=StockLotOut, status_code=status.HTTP_201_CREATED)
async def create_lot(data: StockLotCreate, db: DBSession, current_user: CurrentUser):
    lot = await extras_service.create_lot(db, current_user.company_id, data)
    return StockLotOut.model_validate(lot)


@router.get("/serials", response_model=list[StockSerialOut])
async def list_serials(
    db: DBSession,
    current_user: CurrentUser,
    product_id: Optional[UUID] = None,
    status: Optional[str] = None,
):
    items = await extras_service.list_serials(
        db, current_user.company_id, product_id=product_id, status=status
    )
    return [StockSerialOut.model_validate(i) for i in items]


@router.post(
    "/serials", response_model=StockSerialOut, status_code=status.HTTP_201_CREATED
)
async def create_serial(
    data: StockSerialCreate, db: DBSession, current_user: CurrentUser
):
    try:
        s = await extras_service.create_serial(db, current_user.company_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return StockSerialOut.model_validate(s)


# ---- BOM / Production ----

@router.get("/boms", response_model=list[BomOut])
async def list_boms(db: DBSession, current_user: CurrentUser):
    items = await extras_service.list_boms(db, current_user.company_id)
    return [BomOut.model_validate(i) for i in items]


@router.post("/boms", response_model=BomOut, status_code=status.HTTP_201_CREATED)
async def create_bom(data: BomCreate, db: DBSession, current_user: CurrentUser):
    try:
        bom = await extras_service.create_bom(db, current_user.company_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return BomOut.model_validate(bom)


@router.get("/production-orders", response_model=list[ProductionOrderOut])
async def list_production(db: DBSession, current_user: CurrentUser):
    items = await extras_service.list_production_orders(db, current_user.company_id)
    return [ProductionOrderOut.model_validate(i) for i in items]


@router.post(
    "/production-orders",
    response_model=ProductionOrderOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_production(
    data: ProductionOrderCreate, db: DBSession, current_user: CurrentUser
):
    try:
        po = await extras_service.create_production_order(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ProductionOrderOut.model_validate(po)


@router.post(
    "/production-orders/{order_id}/complete", response_model=ProductionOrderOut
)
async def complete_production(
    order_id: UUID, db: DBSession, current_user: CurrentUser
):
    try:
        po = await extras_service.complete_production(
            db, current_user.company_id, current_user.id, order_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ProductionOrderOut.model_validate(po)


# ---- Commissions ----

@router.get("/commissions/rules", response_model=list[CommissionRuleOut])
async def list_rules(db: DBSession, current_user: CurrentUser):
    items = await extras_service.list_commission_rules(db, current_user.company_id)
    return [CommissionRuleOut.model_validate(i) for i in items]


@router.post(
    "/commissions/rules",
    response_model=CommissionRuleOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_rule(
    data: CommissionRuleCreate, db: DBSession, current_user: CurrentUser
):
    rule = await extras_service.create_commission_rule(
        db, current_user.company_id, data
    )
    return CommissionRuleOut.model_validate(rule)


@router.post(
    "/commissions/calculate/{invoice_id}",
    response_model=list[CommissionEntryOut],
)
async def calc_commissions(
    invoice_id: UUID, db: DBSession, current_user: CurrentUser
):
    try:
        entries = await extras_service.calculate_commissions_for_invoice(
            db, current_user.company_id, invoice_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return [CommissionEntryOut.model_validate(e) for e in entries]


@router.get("/commissions/entries", response_model=list[CommissionEntryOut])
async def list_entries(
    db: DBSession, current_user: CurrentUser, period: Optional[str] = None
):
    items = await extras_service.list_commission_entries(
        db, current_user.company_id, period=period
    )
    return [CommissionEntryOut.model_validate(i) for i in items]


# ---- Currency ----

@router.get("/currency/rates", response_model=list[CurrencyRateOut])
async def list_rates(db: DBSession, current_user: CurrentUser):
    items = await extras_service.list_rates(db, current_user.company_id)
    return [CurrencyRateOut.model_validate(i) for i in items]


@router.post(
    "/currency/rates", response_model=CurrencyRateOut, status_code=status.HTTP_201_CREATED
)
async def create_rate(
    data: CurrencyRateCreate, db: DBSession, current_user: CurrentUser
):
    rate = await extras_service.upsert_rate(db, current_user.company_id, data)
    return CurrencyRateOut.model_validate(rate)


@router.get("/currency/convert")
async def convert(
    db: DBSession,
    current_user: CurrentUser,
    amount: float = Query(..., gt=0),
    from_currency: str = Query(..., min_length=3, max_length=3),
    to_currency: str = Query(..., min_length=3, max_length=3),
):
    try:
        return await extras_service.convert_amount(
            db, current_user.company_id, amount, from_currency, to_currency
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---- Attachments ----

@router.get("/attachments", response_model=list[AttachmentOut])
async def list_attachments(
    db: DBSession,
    current_user: CurrentUser,
    entity_type: str,
    entity_id: UUID,
):
    items = await extras_service.list_attachments(
        db, current_user.company_id, entity_type, entity_id
    )
    return [AttachmentOut.model_validate(i) for i in items]


@router.post(
    "/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED
)
async def create_attachment(
    data: AttachmentCreate, db: DBSession, current_user: CurrentUser
):
    att = await extras_service.create_attachment(
        db, current_user.company_id, current_user.id, data
    )
    return AttachmentOut.model_validate(att)


# ---- Work orders ----

@router.get("/work-orders", response_model=list[WorkOrderOut])
async def list_work_orders(
    db: DBSession, current_user: CurrentUser, status: Optional[str] = None
):
    items = await extras_service.list_work_orders(
        db, current_user.company_id, status=status
    )
    return [WorkOrderOut.model_validate(i) for i in items]


@router.post(
    "/work-orders", response_model=WorkOrderOut, status_code=status.HTTP_201_CREATED
)
async def create_work_order(
    data: WorkOrderCreate, db: DBSession, current_user: CurrentUser
):
    wo = await extras_service.create_work_order(
        db, current_user.company_id, current_user.id, data
    )
    return WorkOrderOut.model_validate(wo)


@router.patch("/work-orders/{order_id}", response_model=WorkOrderOut)
async def update_work_order(
    order_id: UUID, data: WorkOrderUpdate, db: DBSession, current_user: CurrentUser
):
    try:
        wo = await extras_service.update_work_order(
            db, current_user.company_id, order_id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return WorkOrderOut.model_validate(wo)


# ---- Payment providers ----

@router.get("/payment-providers", response_model=list[PaymentProviderOut])
async def list_providers(db: DBSession, current_user: CurrentUser):
    items = await extras_service.list_payment_providers(db, current_user.company_id)
    return [PaymentProviderOut.model_validate(i) for i in items]


@router.post(
    "/payment-providers",
    response_model=PaymentProviderOut,
    status_code=status.HTTP_201_CREATED,
)
async def upsert_provider(
    data: PaymentProviderCreate, db: DBSession, current_user: CurrentUser
):
    cfg = await extras_service.upsert_payment_provider(
        db, current_user.company_id, data
    )
    return PaymentProviderOut.model_validate(cfg)
