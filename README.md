# Gestión Comercial

Sistema multi-empresa (SaaS): ventas, compras, stock, POS, reportes.

**Un login → cada usuario ve solo los datos de su empresa (`company_id`).**

---

## Arquitectura (nube)

```
  Navegador  →  Frontend (Next.js)  →  API (FastAPI)  →  PostgreSQL (Neon)
```

No hace falta Docker en la PC del cliente ni para el día a día en la nube.

| Pieza | Dónde (recomendado) |
|-------|----------------------|
| Base de datos | **Neon** |
| API + Frontend | **Render** (2 Web Services) |
| Código | **GitHub** |

Guía: **[DEPLOY_CLOUD.md](./DEPLOY_CLOUD.md)**

---

## Estructura

```
gestion-comercial/
├── backend/       # FastAPI + Alembic
├── frontend/      # Next.js 15
├── scripts/       # smoke tests (opcional)
├── render.yaml    # Blueprint Render
├── .env.example
└── DEPLOY_CLOUD.md
```

---

## Desarrollo local (opcional)

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+asyncpg://...
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Frontend**

```bash
cd frontend
npm install --legacy-peer-deps
# .env.local → NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm run dev
```

---

## Producción

1. GitHub  
2. Neon → `DATABASE_URL`  
3. Render: API (`rootDir: backend`) + Web (`rootDir: frontend`)  
4. CORS + `NEXT_PUBLIC_API_URL`  
5. `/onboarding` → primera empresa  

Detalle en DEPLOY_CLOUD.md.
