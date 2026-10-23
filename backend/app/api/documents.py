"""API de notas de crédito y remitos."""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import HTMLResponse

from app.api.deps import CurrentUser, DBSession
from app.schemas.documents import (
    CreditNoteCreate,
    CreditNoteOut,
    DebitNoteCreate,
    DeliveryNoteCreate,
    DeliveryNoteFromOrder,
    DeliveryNoteListResponse,
    DeliveryNoteOut,
)
from app.services import documents as documents_service
from app.services.documents import get_delivery_note
from app.services.sales import get_invoice  # optional
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from app.models.sales import Invoice
from app.models.company import Company
from app.models.partner import Partner

router = APIRouter(tags=["Documentos"])


# ---- Notas de crédito ----

@router.post(
    "/credit-notes",
    response_model=CreditNoteOut,
    status_code=status.HTTP_201_CREATED,
    summary="Emitir nota de crédito",
)
async def create_credit_note(
    data: CreditNoteCreate, db: DBSession, current_user: CurrentUser
):
    try:
        nc = await documents_service.create_credit_note(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CreditNoteOut.model_validate(nc)


@router.get("/credit-notes", summary="Listar notas de crédito")
async def list_credit_notes(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    result = await documents_service.list_credit_notes(
        db, current_user.company_id, page=page, page_size=page_size
    )
    return {
        "items": [CreditNoteOut.model_validate(i) for i in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "pages": result["pages"],
    }



# ---- Notas de débito ----

@router.post(
    "/debit-notes",
    response_model=CreditNoteOut,
    status_code=status.HTTP_201_CREATED,
    summary="Emitir nota de débito",
)
async def create_debit_note(
    data: DebitNoteCreate, db: DBSession, current_user: CurrentUser
):
    try:
        nd = await documents_service.create_debit_note(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return CreditNoteOut.model_validate(nd)


@router.get("/debit-notes", summary="Listar notas de débito")
async def list_debit_notes(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    result = await documents_service.list_debit_notes(
        db, current_user.company_id, page=page, page_size=page_size
    )
    return {
        "items": [CreditNoteOut.model_validate(i) for i in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
        "pages": result["pages"],
    }


# ---- Remitos ----

@router.get(
    "/delivery-notes",
    response_model=DeliveryNoteListResponse,
    summary="Listar remitos",
)
async def list_delivery_notes(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, pattern="^(draft|confirmed|delivered|cancelled)$"),
):
    result = await documents_service.list_delivery_notes(
        db, current_user.company_id, page=page, page_size=page_size, status=status
    )
    return DeliveryNoteListResponse(
        items=[DeliveryNoteOut.model_validate(i) for i in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.post(
    "/delivery-notes",
    response_model=DeliveryNoteOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear remito",
)
async def create_delivery_note(
    data: DeliveryNoteCreate, db: DBSession, current_user: CurrentUser
):
    try:
        note = await documents_service.create_delivery_note(
            db, current_user.company_id, current_user.id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return DeliveryNoteOut.model_validate(note)


@router.post(
    "/orders/{order_id}/delivery-note",
    response_model=DeliveryNoteOut,
    status_code=status.HTTP_201_CREATED,
    summary="Generar remito desde pedido",
)
async def delivery_note_from_order(
    order_id: UUID,
    data: DeliveryNoteFromOrder,
    db: DBSession,
    current_user: CurrentUser,
):
    try:
        note = await documents_service.create_delivery_note_from_order(
            db, current_user.company_id, current_user.id, order_id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return DeliveryNoteOut.model_validate(note)


@router.post(
    "/delivery-notes/{note_id}/confirm",
    response_model=DeliveryNoteOut,
    summary="Confirmar remito",
)
async def confirm_delivery_note(
    note_id: UUID, db: DBSession, current_user: CurrentUser
):
    try:
        note = await documents_service.confirm_delivery_note(
            db, current_user.company_id, note_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return DeliveryNoteOut.model_validate(note)


@router.post(
    "/delivery-notes/{note_id}/deliver",
    response_model=DeliveryNoteOut,
    summary="Marcar remito como entregado",
)
async def mark_delivered(
    note_id: UUID, db: DBSession, current_user: CurrentUser
):
    try:
        note = await documents_service.mark_delivered(
            db, current_user.company_id, note_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return DeliveryNoteOut.model_validate(note)


# ---- Impresión HTML (PDF vía navegador: Ctrl+P / Guardar como PDF) ----

@router.get(
    "/print/invoice/{invoice_id}",
    response_class=HTMLResponse,
    summary="Vista imprimible de factura o NC",
)
async def print_invoice(
    invoice_id: UUID, db: DBSession, current_user: CurrentUser
):
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(Invoice.id == invoice_id, Invoice.company_id == current_user.company_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    company = (
        await db.execute(select(Company).where(Company.id == current_user.company_id))
    ).scalar_one()
    partner = (
        await db.execute(select(Partner).where(Partner.id == inv.partner_id))
    ).scalar_one_or_none()

    doc_title = {
        "invoice": "FACTURA",
        "credit_note": "NOTA DE CRÉDITO",
        "debit_note": "NOTA DE DÉBITO",
    }.get(inv.invoice_type, "DOCUMENTO")

    rows = ""
    for ln in inv.lines:
        rows += f"""
        <tr>
          <td>{ln.description}</td>
          <td style="text-align:right">{float(ln.quantity):.2f}</td>
          <td style="text-align:right">{float(ln.unit_price):,.2f}</td>
          <td style="text-align:right">{float(ln.tax_rate):.0f}%</td>
          <td style="text-align:right">{float(ln.subtotal):,.2f}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/>
<title>{doc_title} {inv.invoice_number}</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 40px; color: #111; }}
  h1 {{ margin: 0 0 4px; font-size: 22px; }}
  .muted {{ color: #666; font-size: 13px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 24px; }}
  th, td {{ border-bottom: 1px solid #ddd; padding: 8px; font-size: 13px; text-align: left; }}
  th {{ background: #f5f5f5; }}
  .totals {{ margin-top: 16px; text-align: right; }}
  .totals div {{ margin: 4px 0; }}
  @media print {{ body {{ margin: 12mm; }} .no-print {{ display: none; }} }}
</style></head><body>
<button class="no-print" onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;">Imprimir / PDF</button>
<div style="display:flex;justify-content:space-between;">
  <div>
    <h1>{company.name}</h1>
    <div class="muted">{company.legal_name or ''}</div>
    <div class="muted">CUIT: {company.tax_id or '—'}</div>
  </div>
  <div style="text-align:right;">
    <h1>{doc_title}</h1>
    <div><strong>{inv.invoice_number}</strong></div>
    <div class="muted">Fecha: {inv.invoice_date}</div>
    <div class="muted">Estado: {inv.status}</div>
  </div>
</div>
<div style="margin-top:24px;">
  <strong>Cliente</strong><br/>
  {partner.name if partner else inv.partner_id}<br/>
  <span class="muted">{(partner.tax_id if partner and partner.tax_id else '')}</span>
</div>
<table>
  <thead><tr>
    <th>Descripción</th><th style="text-align:right">Cant.</th>
    <th style="text-align:right">Precio</th><th style="text-align:right">IVA</th>
    <th style="text-align:right">Subtotal</th>
  </tr></thead>
  <tbody>{rows}</tbody>
</table>
<div class="totals">
  <div>Subtotal: <strong>{float(inv.subtotal):,.2f}</strong></div>
  <div>IVA: <strong>{float(inv.tax_amount):,.2f}</strong></div>
  <div style="font-size:18px;">Total: <strong>{float(inv.total):,.2f} {inv.currency_code or company.currency_code}</strong></div>
</div>
{f'<p class="muted" style="margin-top:24px;">Notas: {inv.notes}</p>' if inv.notes else ''}
</body></html>"""
    return HTMLResponse(content=html)


@router.get(
    "/print/delivery-note/{note_id}",
    response_class=HTMLResponse,
    summary="Vista imprimible de remito",
)
async def print_delivery_note(
    note_id: UUID, db: DBSession, current_user: CurrentUser
):
    note = await get_delivery_note(db, current_user.company_id, note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Remito no encontrado")

    company = (
        await db.execute(select(Company).where(Company.id == current_user.company_id))
    ).scalar_one()
    partner = (
        await db.execute(select(Partner).where(Partner.id == note.partner_id))
    ).scalar_one_or_none()

    rows = ""
    for ln in note.lines:
        rows += f"""
        <tr>
          <td>{ln.description or ln.product_id}</td>
          <td style="text-align:right">{float(ln.quantity):.2f}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/>
<title>REMITO {note.note_number}</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 40px; }}
  h1 {{ margin: 0; font-size: 22px; }}
  .muted {{ color: #666; font-size: 13px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 24px; }}
  th, td {{ border-bottom: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }}
  th {{ background: #f5f5f5; }}
  @media print {{ .no-print {{ display: none; }} }}
</style></head><body>
<button class="no-print" onclick="window.print()">Imprimir / PDF</button>
<div style="display:flex;justify-content:space-between;margin-top:12px;">
  <div><h1>{company.name}</h1><div class="muted">{company.tax_id or ''}</div></div>
  <div style="text-align:right;"><h1>REMITO</h1>
    <div><strong>{note.note_number}</strong></div>
    <div class="muted">{note.note_date} · {note.status}</div>
  </div>
</div>
<div style="margin-top:20px;">
  <strong>Destinatario</strong><br/>{partner.name if partner else note.partner_id}<br/>
  <span class="muted">{note.delivery_address or ''}</span>
</div>
<table><thead><tr><th>Producto</th><th style="text-align:right">Cantidad</th></tr></thead>
<tbody>{rows}</tbody></table>
{f'<p class="muted">Notas: {note.notes}</p>' if note.notes else ''}
<p class="muted" style="margin-top:48px;">Firma receptor: _______________________</p>
</body></html>"""
    return HTMLResponse(content=html)


@router.get(
    "/print/ticket/{invoice_id}",
    response_class=HTMLResponse,
    summary="Ticket térmico POS (80mm)",
)
async def print_pos_ticket(
    invoice_id: UUID, db: DBSession, current_user: CurrentUser
):
    """Vista compacta para impresora de ticket / Guardar como PDF."""
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines))
        .where(Invoice.id == invoice_id, Invoice.company_id == current_user.company_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    company = (
        await db.execute(select(Company).where(Company.id == current_user.company_id))
    ).scalar_one()
    partner = (
        await db.execute(select(Partner).where(Partner.id == inv.partner_id))
    ).scalar_one_or_none()

    currency = inv.currency_code or company.currency_code or "ARS"
    lines_html = ""
    for ln in inv.lines:
        desc = (ln.description or "")[:32]
        lines_html += f"""
        <tr>
          <td colspan="2">{desc}</td>
        </tr>
        <tr>
          <td class="muted">{float(ln.quantity):.2f} x {float(ln.unit_price):,.2f}</td>
          <td class="right">{float(ln.subtotal):,.2f}</td>
        </tr>"""

    paid = float(getattr(inv, "amount_paid", None) or inv.total or 0)
    total = float(inv.total or 0)
    change = max(0.0, paid - total) if paid > total else 0.0

    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/>
<title>Ticket {inv.invoice_number}</title>
<style>
  @page {{ size: 80mm auto; margin: 4mm; }}
  body {{
    font-family: "Courier New", ui-monospace, monospace;
    font-size: 12px;
    width: 72mm;
    margin: 0 auto;
    color: #000;
  }}
  .center {{ text-align: center; }}
  .right {{ text-align: right; }}
  .muted {{ color: #333; font-size: 11px; }}
  .sep {{ border-top: 1px dashed #000; margin: 8px 0; }}
  table {{ width: 100%; border-collapse: collapse; }}
  td {{ padding: 1px 0; vertical-align: top; }}
  .total {{ font-size: 14px; font-weight: bold; }}
  @media print {{
    .no-print {{ display: none !important; }}
    body {{ width: 72mm; }}
  }}
</style></head><body>
<button class="no-print" onclick="window.print()"
  style="margin:8px 0;padding:8px 12px;width:100%;">Imprimir ticket</button>
<div class="center">
  <div style="font-weight:bold;font-size:14px;">{company.name}</div>
  <div class="muted">{company.legal_name or ""}</div>
  <div class="muted">CUIT: {company.tax_id or "—"}</div>
</div>
<div class="sep"></div>
<div class="center">
  <div><strong>TICKET / FACTURA</strong></div>
  <div>{inv.invoice_number}</div>
  <div class="muted">{inv.invoice_date}</div>
</div>
<div class="sep"></div>
<div class="muted">Cliente: {partner.name if partner else "Consumidor final"}</div>
<div class="sep"></div>
<table>{lines_html}</table>
<div class="sep"></div>
<table>
  <tr><td>Subtotal</td><td class="right">{float(inv.subtotal):,.2f}</td></tr>
  <tr><td>IVA</td><td class="right">{float(inv.tax_amount):,.2f}</td></tr>
  <tr class="total"><td>TOTAL {currency}</td><td class="right">{total:,.2f}</td></tr>
  {f'<tr><td>Pagado</td><td class="right">{paid:,.2f}</td></tr>' if paid else ""}
  {f'<tr><td>Vuelto</td><td class="right">{change:,.2f}</td></tr>' if change else ""}
</table>
<div class="sep"></div>
<div class="center muted">¡Gracias por su compra!</div>
<script>
  // Auto-print opcional: descomentar si querés imprimir al abrir
  // window.onload = function() {{ window.print(); }};
</script>
</body></html>"""
    return HTMLResponse(content=html)
