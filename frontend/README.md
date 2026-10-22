# Frontend – Gestión Comercial

Next.js 15 + TypeScript + Tailwind CSS + React Query + Zustand.

## Qué incluye

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Login | `/login` | ✅ Completo |
| **Wizard de onboarding didáctico** (8 pasos) | `/onboarding` | ✅ Completo |
| Dashboard con KPIs | `/dashboard` | ✅ Completo |
| Clientes / Proveedores | `/partners` | ✅ Listado + alta |
| Productos | `/products` | ✅ Listado + alta |
| Inventario | `/inventory` | ✅ Resumen + alertas |
| Ventas | `/sales` | ✅ Listado |
| **Punto de Venta** | `/pos` | ✅ Carrito + cobro |
| Caja | `/treasury` | ✅ Resumen |
| Reportes | `/reports` | ✅ KPIs + links API |
| Compras | `/purchases` | Placeholder (API lista) |

## Cómo levantar

```bash
# Terminal 1 – Backend
cd ../backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Terminal 2 – Frontend
cd ../frontend
cp .env.example .env.local
npm install
npm run dev
```

Abrí **http://localhost:3000**

1. Andá a **Registrar empresa** (`/onboarding`)
2. Completá el wizard de 8 pasos
3. Entrá al dashboard

## Variables de entorno

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Stack

- **Next.js 15** (App Router)
- **Tailwind CSS**
- **TanStack React Query** — cache y fetching
- **Zustand** — auth state
- **Axios** — cliente HTTP con interceptor JWT
- **Lucide React** — iconos
EOF