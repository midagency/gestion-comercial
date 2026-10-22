# Backend – Gestión Comercial

API **FastAPI + SQLAlchemy 2 (async) + PostgreSQL**. Multi-tenant.

## Módulos implementados

| Módulo | Estado |
|--------|--------|
| Onboarding didáctico | ✅ |
| Auth (JWT) | ✅ |
| Clientes / Proveedores | ✅ |
| Catálogo | ✅ |
| Inventario | ✅ |
| Ventas | ✅ |
| Compras | ✅ |
| Caja / Tesorería | ✅ |
| Punto de Venta (POS) | ✅ |
| **Reportes / Dashboard** | ✅ |

## Cómo levantar

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Docs: http://localhost:8000/docs

---

## Reportes

Todos los endpoints requieren autenticación y filtran por `company_id`.

### Dashboard

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/reports/dashboard` | KPIs del día/mes: ventas, cobros, compras, stock, CxC, CxP, caja |

### Ventas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/reports/sales/by-period` | Ventas agrupadas por día o mes |
| GET | `/api/v1/reports/sales/by-product` | Top productos vendidos |
| GET | `/api/v1/reports/sales/by-customer` | Top clientes |

Query params: `date_from`, `date_to`, `group_by=day|month`, `limit`

### Compras

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/reports/purchases/by-period` | Compras por día/mes |

### Inventario

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/reports/inventory/valuation` | Valuación de stock (qty × costo) |
| GET | `/api/v1/reports/inventory/movements-summary` | Resumen de movimientos por tipo |

### Cuentas por cobrar / pagar (Aging)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/reports/aging/receivable` | CxC con buckets: current, 1-30, 31-60, 61-90, 90+ |
| GET | `/api/v1/reports/aging/payable` | CxP con los mismos buckets |

Query: `as_of` (fecha de corte, default hoy)

### Caja

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/v1/reports/cash/sessions` | Sesiones de caja del período + diferencias de arqueo |

### Ejemplo Dashboard

```json
GET /api/v1/reports/dashboard

{
  "sales_today": 45000,
  "sales_this_month": 890000,
  "sales_count_this_month": 156,
  "collections_this_month": 720000,
  "purchases_this_month": 310000,
  "low_stock_count": 8,
  "zero_stock_count": 2,
  "accounts_receivable": 125000,
  "accounts_payable": 48000,
  "open_cash_sessions": 1,
  "cash_in_sessions": 12500,
  "bank_balance": 450000
}
```

## Backend completo

```
Onboarding → Auth → Clientes → Productos → Inventario
    → Ventas → Compras → Caja → POS → Reportes
```

## Próximos pasos posibles

1. Frontend (wizard + dashboard + POS)
2. Exportación PDF/Excel de reportes
3. Notas de crédito
4. Notificaciones / alertas programadas
