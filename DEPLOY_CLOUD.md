# Despliegue en la nube (sin Docker)

El cliente solo abre la URL del **frontend**. No instala nada.

| Pieza | Plataforma recomendada |
|-------|------------------------|
| PostgreSQL | **Neon** (gratis) |
| API FastAPI | **Render** Web Service |
| Frontend Next.js | **Render** Web Service (o Vercel) |
| Código | **GitHub** |

---

## 0. Estructura del repo en GitHub (crítico)

En la **raíz** del repositorio deben verse:

```text
backend/
frontend/
render.yaml
DEPLOY_CLOUD.md
README.md
.env.example
```

**Mal** (causa de fallos anteriores):

```text
gestion-comercial/     ← carpeta extra
  backend/
  frontend/
```

Si tenés la carpeta anidada, en Render usá Root Directory:

- API: `gestion-comercial/backend`
- Web: `gestion-comercial/frontend`

Mejor: re-subí el repo sin la carpeta intermedia.

---

## 1. Neon (base de datos)

1. [https://neon.tech](https://neon.tech) → Create project  
2. Connection string → **modificá el esquema**:

```text
# Neon te da algo como:
postgres://USER:PASS@ep-xxx.region.aws.neon.tech/neondb?sslmode=require

# Para esta API debe quedar:
postgresql+asyncpg://USER:PASS@ep-xxx.region.aws.neon.tech/neondb?ssl=require
```

Notas:

- Usá `postgresql+asyncpg://` (no solo `postgres://`).
- Preferí `ssl=require` (asyncpg entiende bien esa forma).
- Si el password tiene `@`, `#`, `%`, etc., codificalo en URL (o regenerá uno simple).

---

## 2. API en Render (sin Docker)

**New → Web Service** → mismo repo GitHub:

| Campo | Valor |
|-------|--------|
| Name | `gestion-api` |
| Language / Runtime | **Python 3** (no Docker) |
| Root Directory | `backend` (o `gestion-comercial/backend` si está anidado) |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `sh scripts/start_cloud.sh` |

Variables de entorno:

```env
PYTHON_VERSION=3.12.8
DEBUG=false
CREATE_DEMO_DATA=false
AUTO_CREATE_SCHEMA=false
SECRET_KEY=<openssl rand -hex 32>
DATABASE_URL=postgresql+asyncpg://USER:PASS@HOST/neondb?ssl=require
CORS_ORIGINS=["https://PENDIENTE-FRONTEND.onrender.com"]
```

El script `scripts/start_cloud.sh` hace:

1. `alembic upgrade head` (crea tablas)
2. `uvicorn` en el puerto `$PORT` de Render

Probar cuando esté Live:

```text
https://gestion-api-xxxx.onrender.com/health
```

Respuesta esperada: `{"status":"ok",...}`

### Error típico: `Can't load plugin: sqlalchemy.dialects:driver`

`DATABASE_URL` mal formada o vacía. Revisá que empiece exactamente con `postgresql+asyncpg://` y que esté cargada en Environment del servicio.

---

## 3. Frontend en Render

**New → Web Service** → mismo repo:

| Campo | Valor |
|-------|--------|
| Name | `gestion-web` |
| Runtime | **Node** |
| Root Directory | `frontend` |
| Build Command | `npm install --legacy-peer-deps && npm run build` |
| Start Command | `npx next start --hostname 0.0.0.0 --port $PORT` |

Variables:

```env
NODE_VERSION=20
NEXT_PUBLIC_API_URL=https://gestion-api-xxxx.onrender.com/api/v1
```

(`NEXT_PUBLIC_*` se embebe en el build: si cambiás la URL de la API, hay que **rebuild** del front.)

---

## 4. Cerrar el circuito

1. Copiá la URL pública del front (ej. `https://gestion-web-xxxx.onrender.com`).
2. En la API → Environment → actualizá:

```env
CORS_ORIGINS=["https://gestion-web-xxxx.onrender.com"]
```

3. Abrí: `https://gestion-web-xxxx.onrender.com/onboarding`  
4. Creá la primera empresa + admin.

---

## 5. Alternativa: frontend en Vercel

1. [vercel.com](https://vercel.com) → Import repo  
2. Root Directory: `frontend`  
3. Env: `NEXT_PUBLIC_API_URL=https://gestion-api-xxxx.onrender.com/api/v1`  
4. Deploy  
5. Poné la URL de Vercel en `CORS_ORIGINS` de la API.

La API puede seguir en Render; Vercel solo hospeda el Next.js.

---

## 6. Blueprint (opcional)

Si el repo tiene `backend/` y `frontend/` en la raíz:

**New → Blueprint** → conectá el repo → completá `DATABASE_URL`, `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`.

Archivo: `render.yaml`.

---

## 7. Plan free de Render

- El servicio se duerme tras ~15 min sin tráfico.
- El primer request puede tardar 30–60 s.
- Para demos: entrás una vez, esperás el wake-up, y listo.

---

## Checklist rápido

- [ ] Repo con `backend/` y `frontend/` accesibles (sin carpeta extra, o Root Directory correcto)
- [ ] `backend/alembic.ini` presente
- [ ] Neon con URL `postgresql+asyncpg://...`
- [ ] API Live y `/health` OK
- [ ] Front con `NEXT_PUBLIC_API_URL` apuntando a la API
- [ ] `CORS_ORIGINS` con la URL exacta del front
- [ ] Onboarding completado
