"""
Modelos de Empresa, Sucursal y Almacén.
Base del multi-tenant: casi todas las tablas referencian company_id.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String(250))
    tax_id: Mapped[Optional[str]] = mapped_column(String(50))  # CUIT / NIF / RFC
    logo_url: Mapped[Optional[str]] = mapped_column(Text)
    country_code: Mapped[str] = mapped_column(String(2), default="AR")
    currency_code: Mapped[str] = mapped_column(String(3), default="ARS")
    province: Mapped[Optional[str]] = mapped_column(String(100))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    postal_code: Mapped[Optional[str]] = mapped_column(String(20))
    address: Mapped[Optional[str]] = mapped_column(Text)  # domicilio fiscal
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(40))
    business_type: Mapped[Optional[str]] = mapped_column(String(50))  # retail, wholesale, services...
    # Configuración flexible (módulos activos, impuestos, numeración, etc.)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relaciones
    branches: Mapped[list["Branch"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    warehouses: Mapped[list["Warehouse"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    users: Mapped[list["User"]] = relationship(back_populates="company", cascade="all, delete-orphan")
    roles: Mapped[list["Role"]] = relationship(back_populates="company", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Company {self.name}>"


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(20))
    address: Mapped[Optional[str]] = mapped_column(Text)
    city: Mapped[Optional[str]] = mapped_column(String(100))
    is_main: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship(back_populates="branches")
    warehouses: Mapped[list["Warehouse"]] = relationship(back_populates="branch")

    def __repr__(self) -> str:
        return f"<Branch {self.name}>"


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(20))
    is_main: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped["Company"] = relationship(back_populates="warehouses")
    branch: Mapped[Optional["Branch"]] = relationship(back_populates="warehouses")

    def __repr__(self) -> str:
        return f"<Warehouse {self.name}>"


# Evitar import circular
from app.models.user import User, Role  # noqa: E402
