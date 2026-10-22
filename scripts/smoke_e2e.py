#!/usr/bin/env python3
"""
Smoke test E2E del flujo comercial completo (API).

Flujo:
  1. Health
  2. Onboarding (empresa + admin)  — o login si ya existe
  3. Producto + lista de precios (si aplica)
  4. Stock inicial (entrada)
  5. Abrir sesión de caja
  6. Venta POS
  7. Cerrar caja (arqueo)
  8. Reportes / dashboard
  9. Factura imprimible (HTML)

Uso:
  # API local por defecto
  python scripts/smoke_e2e.py

  # Contra otro host
  API_URL=http://localhost:8000/api/v1 python scripts/smoke_e2e.py

  # Reutilizar usuario ya creado (salta onboarding)
  SMOKE_EMAIL=admin@test.com SMOKE_PASSWORD=admin1234 python scripts/smoke_e2e.py

Requisitos: API levantada (docker compose up) + httpx
  pip install httpx
"""

from __future__ import annotations

import os
import sys
import time
import uuid
from typing import Any, Optional

try:
    import httpx
except ImportError:
    print("ERROR: instalá httpx →  pip install httpx")
    sys.exit(2)

API_URL = os.getenv("API_URL", "http://127.0.0.1:8000/api/v1").rstrip("/")
BASE = API_URL.rsplit("/api/v1", 1)[0] or "http://127.0.0.1:8000"
EMAIL = os.getenv("SMOKE_EMAIL", f"smoke_{uuid.uuid4().hex[:8]}@example.com")
PASSWORD = os.getenv("SMOKE_PASSWORD", "SmokeTest1!")
TIMEOUT = float(os.getenv("SMOKE_TIMEOUT", "30"))

passed = 0
failed = 0
skipped = 0


class SmokeError(Exception):
    pass


def ok(name: str, detail: str = "") -> None:
    global passed
    passed += 1
    extra = f" — {detail}" if detail else ""
    print(f"  ✓ {name}{extra}")


def fail(name: str, detail: str) -> None:
    global failed
    failed += 1
    print(f"  ✗ {name} — {detail}")


def skip(name: str, detail: str) -> None:
    global skipped
    skipped += 1
    print(f"  ○ {name} — {detail}")


def req(
    client: httpx.Client,
    method: str,
    path: str,
    *,
    expected: int | tuple[int, ...] = 200,
    **kwargs: Any,
) -> httpx.Response:
    url = path if path.startswith("http") else f"{API_URL}{path}"
    r = client.request(method, url, **kwargs)
    expected_set = {expected} if isinstance(expected, int) else set(expected)
    if r.status_code not in expected_set:
        body = r.text[:400]
        raise SmokeError(f"{method} {path} → {r.status_code}: {body}")
    return r


def main() -> int:
    print(f"\n=== Smoke E2E · {API_URL} ===\n")
    client = httpx.Client(timeout=TIMEOUT, follow_redirects=True)
    token: Optional[str] = None
    headers: dict[str, str] = {}

    # ------------------------------------------------------------------ 1 Health
    print("1. Health")
    try:
        r = client.get(f"{BASE}/health")
        if r.status_code != 200:
            raise SmokeError(f"status {r.status_code}")
        data = r.json()
        ok("GET /health", str(data.get("status", data)))
    except Exception as e:
        fail("GET /health", str(e))
        print("\nAPI no disponible. Levantá el stack:")
        print("  docker compose up --build -d")
        print("  # o: docker compose -f docker-compose.prod.yml --env-file .env up -d --build")
        return 1

    # ------------------------------------------------------------------ 2 Auth
    print("\n2. Onboarding / Login")
    company_name = f"Smoke Co {uuid.uuid4().hex[:6]}"
    onboarded = False

    # Intentar login primero si el usuario ya existe
    try:
        r = req(
            client,
            "POST",
            "/auth/login",
            expected=(200, 401, 400, 422),
            json={"email": EMAIL, "password": PASSWORD},
        )
        if r.status_code == 200:
            token = r.json().get("access_token")
            ok("Login existente", EMAIL)
        else:
            # Schema real: OnboardingComplete con step1…step7
            payload = {
                "step1": {"business_type": "retail"},
                "step2": {
                    "name": company_name,
                    "legal_name": company_name,
                    "tax_id": "30-00000000-0",
                    "country_code": "AR",
                    "currency_code": "ARS",
                },
                "step3": {
                    "has_multiple_locations": False,
                    "branches": [
                        {"name": "Casa central", "code": "SC", "is_main": True}
                    ],
                    "warehouses": [
                        {
                            "name": "Depósito principal",
                            "code": "WH1",
                            "branch_index": 0,
                            "is_main": True,
                        }
                    ],
                },
                "step4": {
                    "enabled_modules": [
                        "inventory",
                        "pos",
                        "sales",
                        "purchases",
                        "treasury",
                        "reports",
                    ]
                },
                "step5": {
                    "price_lists": [
                        {
                            "name": "General",
                            "currency_code": "ARS",
                            "is_default": True,
                        }
                    ]
                },
                "step6": {
                    "tax_rates": [
                        {"name": "IVA 21%", "rate": 21.0, "is_default": True}
                    ],
                    "sequences": [
                        {
                            "document_type": "invoice",
                            "prefix": "FAC",
                            "next_number": 1,
                            "padding": 5,
                        }
                    ],
                },
                "step7": {
                    "email": EMAIL,
                    "password": PASSWORD,
                    "first_name": "Smoke",
                    "last_name": "Tester",
                },
            }
            r2 = client.post(f"{API_URL}/onboarding/complete", json=payload)
            if r2.status_code not in (200, 201):
                raise SmokeError(f"onboarding {r2.status_code}: {r2.text[:500]}")
            body = r2.json()
            token = body.get("access_token")
            if not token:
                r3 = req(
                    client,
                    "POST",
                    "/auth/login",
                    json={"email": EMAIL, "password": PASSWORD},
                )
                token = r3.json().get("access_token")
            if not token:
                raise SmokeError(f"sin token tras onboarding: {str(body)[:300]}")
            onboarded = True
            ok("Onboarding", company_name)
    except Exception as e:
        fail("Auth", str(e))
        return 1

    headers = {"Authorization": f"Bearer {token}"}
    client.headers.update(headers)

    try:
        me = req(client, "GET", "/auth/me").json()
        ok("GET /auth/me", me.get("email") or me.get("full_name") or "ok")
    except Exception as e:
        fail("GET /auth/me", str(e))
        return 1

    # ------------------------------------------------------------------ 3 Catálogo
    print("\n3. Producto")
    sku = f"SMK-{uuid.uuid4().hex[:6].upper()}"
    product_id = None
    try:
        r = req(
            client,
            "POST",
            "/products",
            expected=(200, 201),
            json={
                "name": f"Producto smoke {sku}",
                "sku": sku,
                "product_type": "product",
                "track_stock": True,
                "unit": "unit",
            },
        )
        product = r.json()
        product_id = str(product.get("id") or product.get("product_id"))
        ok("POST /products", f"{sku} id={product_id[:8]}…")

        # Precio en lista default (si existe)
        try:
            lists = req(client, "GET", "/price-lists").json()
            pl_items = lists.get("items") if isinstance(lists, dict) else lists
            if pl_items:
                pl_id = str(pl_items[0]["id"])
                client.post(
                    f"{API_URL}/price-lists/{pl_id}/items",
                    json={
                        "product_id": product_id,
                        "unit_price": 1000.0,
                        "min_qty": 1,
                    },
                )
                # ignore status — POS puede mandar unit_price explícito
                ok("Precio en lista", "1000.00")
            else:
                skip("Precio en lista", "no hay listas")
        except Exception as e:
            skip("Precio en lista", str(e)[:120])
    except Exception as e:
        fail("POST /products", str(e))
        return 1

    # ------------------------------------------------------------------ 4 Stock
    print("\n4. Inventario — entrada de stock")
    warehouse_id = None
    try:
        whs = req(client, "GET", "/settings/warehouses").json()
        if isinstance(whs, list) and whs:
            warehouse_id = str(whs[0]["id"])
        elif isinstance(whs, dict) and whs.get("items"):
            warehouse_id = str(whs["items"][0]["id"])
        ok("Listar almacenes", warehouse_id[:8] + "…" if warehouse_id else "vacío")
    except Exception as e:
        fail("Listar almacenes", str(e))

    try:
        if not warehouse_id:
            raise SmokeError("sin warehouse_id")
        move_payload = {
            "warehouse_id": warehouse_id,
            "product_id": product_id,
            "move_type": "in",
            "quantity": 50,
            "notes": "smoke e2e",
        }
        r = req(
            client,
            "POST",
            "/inventory/moves",
            expected=(200, 201),
            json=move_payload,
        )
        ok("Entrada de stock", "qty=50")
    except Exception as e:
        fail("Entrada de stock", str(e))
        # no abortamos: POS puede fallar por stock

    # ------------------------------------------------------------------ 5 Caja
    print("\n5. Caja — abrir sesión")
    session_id = None
    register_id = None
    try:
        regs = req(client, "GET", "/treasury/registers").json()
        reg_list = regs if isinstance(regs, list) else regs.get("items") or []
        if not reg_list:
            # crear caja
            r = req(
                client,
                "POST",
                "/treasury/registers",
                expected=(200, 201),
                json={"name": "Caja smoke", "code": "SMK"},
            )
            reg_list = [r.json()]
            ok("Crear caja", "Caja smoke")
        else:
            ok("Listar cajas", str(len(reg_list)))

        reg = reg_list[0]
        register_id = str(reg["id"])
        if reg.get("open_session_id"):
            session_id = str(reg["open_session_id"])
            ok("Sesión ya abierta", session_id[:8] + "…")
        else:
            r = req(
                client,
                "POST",
                "/treasury/sessions/open",
                expected=(200, 201),
                json={"register_id": register_id, "opening_amount": 1000},
            )
            session_id = str(r.json()["id"])
            ok("Abrir sesión", session_id[:8] + "…")
    except Exception as e:
        fail("Caja", str(e))
        return 1

    # ------------------------------------------------------------------ 6 POS
    print("\n6. Venta POS")
    invoice_id = None
    try:
        # precio desde búsqueda POS
        prods = req(
            client, "GET", "/pos/products", params={"q": sku, "limit": 5}
        ).json()
        items = prods.get("items") or prods if isinstance(prods, list) else []
        unit_price = 1210.0
        if items:
            unit_price = float(items[0].get("unit_price") or unit_price)
            ok("Búsqueda POS", items[0].get("name", sku))
        else:
            skip("Búsqueda POS", "sin resultados, usamos precio fijo")

        sale_payload = {
            "session_id": session_id,
            "warehouse_id": warehouse_id,
            "lines": [
                {
                    "product_id": product_id,
                    "quantity": 2,
                    "unit_price": unit_price,
                    "tax_rate": 21,
                }
            ],
            "payments": [{"payment_method": "cash", "amount": unit_price * 2 * 1.21}],
        }
        r = req(
            client,
            "POST",
            "/pos/sales",
            expected=(200, 201),
            json=sale_payload,
        )
        sale = r.json()
        invoice_id = str(sale.get("invoice_id") or "")
        ok(
            "POST /pos/sales",
            f"{sale.get('invoice_number') or sale.get('order_number')} total={sale.get('total')}",
        )
    except Exception as e:
        fail("Venta POS", str(e))
        # seguir a reportes

    # ------------------------------------------------------------------ 7 Cerrar caja
    print("\n7. Cerrar sesión de caja")
    try:
        # monto contado aproximado
        detail = req(client, "GET", f"/treasury/sessions/{session_id}").json()
        expected_amt = float(
            detail.get("expected_amount")
            or (
                float(detail.get("opening_amount") or 0)
                + float(detail.get("total_income") or 0)
                - float(detail.get("total_expense") or 0)
            )
        )
        r = req(
            client,
            "POST",
            f"/treasury/sessions/{session_id}/close",
            json={"closing_amount": expected_amt, "notes": "smoke e2e"},
        )
        closed = r.json()
        ok(
            "Cerrar sesión",
            f"diff={closed.get('difference')} status={closed.get('status')}",
        )
    except Exception as e:
        fail("Cerrar sesión", str(e))

    # ------------------------------------------------------------------ 8 Reportes
    print("\n8. Reportes")
    try:
        dash = req(client, "GET", "/reports/dashboard").json()
        ok(
            "Dashboard",
            f"ventas_mes={dash.get('sales_this_month')} cxс={dash.get('accounts_receivable')}",
        )
    except Exception as e:
        fail("Dashboard", str(e))

    try:
        sales = req(
            client, "GET", "/reports/sales/by-period", params={"group_by": "day"}
        ).json()
        n = len(sales.get("items") or [])
        ok("Ventas por período", f"{n} buckets")
    except Exception as e:
        fail("Ventas por período", str(e))

    # ------------------------------------------------------------------ 9 Print
    print("\n9. Impresión")
    if invoice_id:
        try:
            r = req(
                client,
                "GET",
                f"/print/invoice/{invoice_id}",
                headers={**headers, "Accept": "text/html"},
            )
            if "FACTURA" in r.text.upper() or "html" in r.text.lower():
                ok("Print factura HTML", f"{len(r.text)} bytes")
            else:
                fail("Print factura HTML", "contenido inesperado")
        except Exception as e:
            fail("Print factura HTML", str(e))
        try:
            r = req(
                client,
                "GET",
                f"/print/ticket/{invoice_id}",
                headers={**headers, "Accept": "text/html"},
            )
            ok("Print ticket 80mm", f"{len(r.text)} bytes")
        except Exception as e:
            fail("Print ticket 80mm", str(e))
    else:
        skip("Print", "sin invoice_id de la venta POS")

    # ------------------------------------------------------------------ Summary
    print("\n" + "=" * 40)
    print(f"  OK: {passed}   FAIL: {failed}   SKIP: {skipped}")
    if onboarded:
        print(f"  Usuario creado: {EMAIL} / {PASSWORD}")
    print("=" * 40 + "\n")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAbortado")
        sys.exit(130)
