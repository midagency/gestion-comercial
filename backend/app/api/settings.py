"""API de configuración: empresa, sucursales, almacenes, usuarios y roles."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUser, DBSession
from app.schemas.settings import (
    AVAILABLE_PERMISSIONS,
    BranchCreate,
    BranchOut,
    CompanyOut,
    CompanyUpdate,
    RoleCreate,
    RoleOut,
    UserCreate,
    UserOut,
    UserUpdate,
    WarehouseCreate,
    WarehouseOut,
)
from app.services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["Configuración"])


def _require_owner_or_settings(user) -> None:
    if not user.is_owner:
        # Sin sistema de permisos runtime completo aún: owner o cualquiera activo
        # En producción filtrar por "settings.manage"
        pass


@router.get("/company", response_model=CompanyOut, summary="Datos de la empresa")
async def get_company(db: DBSession, current_user: CurrentUser):
    company = await settings_service.get_company(db, current_user.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return CompanyOut.model_validate(company)


@router.patch("/company", response_model=CompanyOut, summary="Actualizar empresa")
async def update_company(
    data: CompanyUpdate, db: DBSession, current_user: CurrentUser
):
    company = await settings_service.get_company(db, current_user.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    company = await settings_service.update_company(db, company, data)
    return CompanyOut.model_validate(company)


@router.get("/branches", response_model=list[BranchOut])
async def list_branches(db: DBSession, current_user: CurrentUser):
    items = await settings_service.list_branches(db, current_user.company_id)
    return [BranchOut.model_validate(b) for b in items]


@router.post("/branches", response_model=BranchOut, status_code=status.HTTP_201_CREATED)
async def create_branch(
    data: BranchCreate, db: DBSession, current_user: CurrentUser
):
    branch = await settings_service.create_branch(db, current_user.company_id, data)
    return BranchOut.model_validate(branch)


@router.get("/warehouses", response_model=list[WarehouseOut])
async def list_warehouses(db: DBSession, current_user: CurrentUser):
    items = await settings_service.list_warehouses_settings(db, current_user.company_id)
    return [WarehouseOut.model_validate(w) for w in items]


@router.post(
    "/warehouses", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED
)
async def create_warehouse(
    data: WarehouseCreate, db: DBSession, current_user: CurrentUser
):
    wh = await settings_service.create_warehouse(db, current_user.company_id, data)
    return WarehouseOut.model_validate(wh)


@router.get("/permissions", summary="Listado de permisos del sistema")
async def list_permissions(current_user: CurrentUser):
    return {"permissions": AVAILABLE_PERMISSIONS}


@router.get("/roles", response_model=list[RoleOut])
async def list_roles(db: DBSession, current_user: CurrentUser):
    roles = await settings_service.list_roles(db, current_user.company_id)
    return [RoleOut.model_validate(r) for r in roles]


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
    data: RoleCreate, db: DBSession, current_user: CurrentUser
):
    if not current_user.is_owner:
        raise HTTPException(status_code=403, detail="Solo el owner puede crear roles")
    role = await settings_service.create_role(db, current_user.company_id, data)
    return RoleOut.model_validate(role)


@router.get("/users", response_model=list[UserOut])
async def list_users(db: DBSession, current_user: CurrentUser):
    users = await settings_service.list_users(db, current_user.company_id)
    out = []
    for u in users:
        item = UserOut(
            id=u.id,
            email=u.email,
            first_name=u.first_name,
            last_name=u.last_name,
            full_name=u.full_name,
            phone=u.phone,
            role_id=u.role_id,
            role_name=u.role.name if u.role else None,
            is_active=u.is_active,
            is_owner=u.is_owner,
            created_at=u.created_at,
        )
        out.append(item)
    return out


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate, db: DBSession, current_user: CurrentUser
):
    if not current_user.is_owner:
        raise HTTPException(status_code=403, detail="Solo el owner puede crear usuarios")
    try:
        user = await settings_service.create_user(db, current_user.company_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        full_name=user.full_name,
        phone=user.phone,
        role_id=user.role_id,
        role_name=user.role.name if user.role else None,
        is_active=user.is_active,
        is_owner=user.is_owner,
        created_at=user.created_at,
    )


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID, data: UserUpdate, db: DBSession, current_user: CurrentUser
):
    if not current_user.is_owner and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Sin permiso")
    user = await settings_service.get_user(db, current_user.company_id, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # Solo owner puede cambiar is_active / role_id de otros
    if not current_user.is_owner:
        data.role_id = None
        data.is_active = None
    user = await settings_service.update_user(db, user, data)
    return UserOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        full_name=user.full_name,
        phone=user.phone,
        role_id=user.role_id,
        role_name=user.role.name if user.role else None,
        is_active=user.is_active,
        is_owner=user.is_owner,
        created_at=user.created_at,
    )
