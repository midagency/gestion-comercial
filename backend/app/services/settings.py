"""Configuración de empresa, sucursales, almacenes, roles y usuarios."""

from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password
from app.models.company import Branch, Company, Warehouse
from app.models.user import Role, User
from app.schemas.settings import (
    BranchCreate,
    CompanyUpdate,
    RoleCreate,
    UserCreate,
    UserUpdate,
    WarehouseCreate,
)


async def get_company(db: AsyncSession, company_id: UUID) -> Optional[Company]:
    result = await db.execute(select(Company).where(Company.id == company_id))
    return result.scalar_one_or_none()


async def update_company(
    db: AsyncSession, company: Company, data: CompanyUpdate
) -> Company:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    await db.flush()
    await db.refresh(company)
    return company


async def list_branches(db: AsyncSession, company_id: UUID) -> list[Branch]:
    result = await db.execute(
        select(Branch)
        .where(Branch.company_id == company_id)
        .order_by(Branch.name)
    )
    return list(result.scalars().all())


async def create_branch(
    db: AsyncSession, company_id: UUID, data: BranchCreate
) -> Branch:
    branch = Branch(company_id=company_id, **data.model_dump())
    db.add(branch)
    await db.flush()
    await db.refresh(branch)
    return branch


async def list_warehouses_settings(
    db: AsyncSession, company_id: UUID
) -> list[Warehouse]:
    result = await db.execute(
        select(Warehouse)
        .where(Warehouse.company_id == company_id)
        .order_by(Warehouse.name)
    )
    return list(result.scalars().all())


async def create_warehouse(
    db: AsyncSession, company_id: UUID, data: WarehouseCreate
) -> Warehouse:
    wh = Warehouse(company_id=company_id, **data.model_dump())
    db.add(wh)
    await db.flush()
    await db.refresh(wh)
    return wh


async def list_roles(db: AsyncSession, company_id: UUID) -> list[Role]:
    result = await db.execute(
        select(Role)
        .where((Role.company_id == company_id) | (Role.company_id.is_(None)))
        .order_by(Role.name)
    )
    return list(result.scalars().all())


async def create_role(
    db: AsyncSession, company_id: UUID, data: RoleCreate
) -> Role:
    role = Role(
        company_id=company_id,
        name=data.name,
        description=data.description,
        permissions=data.permissions,
        is_system=False,
    )
    db.add(role)
    await db.flush()
    await db.refresh(role)
    return role


async def list_users(db: AsyncSession, company_id: UUID) -> list[User]:
    result = await db.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.company_id == company_id)
        .order_by(User.email)
    )
    return list(result.scalars().unique().all())


async def create_user(
    db: AsyncSession, company_id: UUID, data: UserCreate
) -> User:
    existing = await db.execute(
        select(User).where(User.company_id == company_id, User.email == data.email)
    )
    if existing.scalar_one_or_none():
        raise ValueError("Ya existe un usuario con ese email en la empresa")

    if data.role_id:
        role = await db.execute(
            select(Role).where(
                Role.id == data.role_id,
                (Role.company_id == company_id) | (Role.company_id.is_(None)),
            )
        )
        if not role.scalar_one_or_none():
            raise ValueError("Rol no encontrado")

    user = User(
        company_id=company_id,
        email=data.email,
        password_hash=hash_password(data.password),
        first_name=data.first_name,
        last_name=data.last_name,
        phone=data.phone,
        role_id=data.role_id,
        is_owner=False,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user, attribute_names=["role"])
    return user


async def update_user(
    db: AsyncSession, user: User, data: UserUpdate
) -> User:
    updates = data.model_dump(exclude_unset=True)
    if "password" in updates:
        pwd = updates.pop("password")
        if pwd:
            user.password_hash = hash_password(pwd)
    for field, value in updates.items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user, attribute_names=["role"])
    return user


async def get_user(
    db: AsyncSession, company_id: UUID, user_id: UUID
) -> Optional[User]:
    result = await db.execute(
        select(User)
        .options(selectinload(User.role))
        .where(User.id == user_id, User.company_id == company_id)
    )
    return result.scalar_one_or_none()
