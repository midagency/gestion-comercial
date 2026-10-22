"""
Partners: clientes y proveedores unificados en una sola tabla.
partner_type = 'customer' | 'supplier' | 'both'
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Partner(Base):
    __tablename__ = "partners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    partner_type: Mapped[str] = mapped_column(String(20), nullable=False)  # customer, supplier, both
    name: Mapped[str] = mapped_column(String(250), nullable=False)  # nombre de fantasía
    legal_name: Mapped[Optional[str]] = mapped_column(String(250))  # razón social
    tax_id: Mapped[Optional[str]] = mapped_column(String(50))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(40))
    mobile: Mapped[Optional[str]] = mapped_column(String(40))
    address: Mapped[Optional[str]] = mapped_column(Text)  # domicilio fiscal
    city: Mapped[Optional[str]] = mapped_column(String(100))
    province: Mapped[Optional[str]] = mapped_column(String(100))
    postal_code: Mapped[Optional[str]] = mapped_column(String(20))
    country_code: Mapped[Optional[str]] = mapped_column(String(2))
    price_list_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    payment_term_days: Mapped[int] = mapped_column(Integer, default=0)
    credit_limit: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tags: Mapped[Optional[list]] = mapped_column(ARRAY(String))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<Partner {self.name} ({self.partner_type})>"
