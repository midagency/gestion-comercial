"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-10-21

Crea todas las tablas a partir de Base.metadata (instalación greenfield).
Cambios posteriores: alembic revision --autogenerate -m "..."
"""

from typing import Sequence, Union

from alembic import op

from app.core.database import Base
import app.models  # noqa: F401

revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
