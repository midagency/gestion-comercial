"""extend company partner product price_list fields

Revision ID: 002_extend
Revises: 001_initial
Create Date: 2026-10-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = "002_extend"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_column_if_missing(table: str, column: str, ddl: str) -> None:
    """PostgreSQL: agrega columna solo si no existe."""
    conn = op.get_bind()
    exists = conn.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    ).scalar()
    if not exists:
        op.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))


def upgrade() -> None:
    _add_column_if_missing("companies", "province", "province VARCHAR(100)")
    _add_column_if_missing("companies", "city", "city VARCHAR(100)")
    _add_column_if_missing("companies", "postal_code", "postal_code VARCHAR(20)")
    _add_column_if_missing("companies", "address", "address TEXT")
    _add_column_if_missing("companies", "email", "email VARCHAR(255)")
    _add_column_if_missing("companies", "phone", "phone VARCHAR(40)")

    _add_column_if_missing("partners", "province", "province VARCHAR(100)")
    _add_column_if_missing("partners", "postal_code", "postal_code VARCHAR(20)")

    _add_column_if_missing(
        "products",
        "subcategory_id",
        "subcategory_id UUID REFERENCES product_categories(id) ON DELETE SET NULL",
    )
    _add_column_if_missing("products", "brand", "brand VARCHAR(120)")

    _add_column_if_missing(
        "price_lists",
        "discount_percent",
        "discount_percent NUMERIC(8,4) DEFAULT 0",
    )
    _add_column_if_missing(
        "price_lists",
        "discount_amount",
        "discount_amount NUMERIC(14,2) DEFAULT 0",
    )


def downgrade() -> None:
    for table, col in [
        ("price_lists", "discount_amount"),
        ("price_lists", "discount_percent"),
        ("products", "brand"),
        ("products", "subcategory_id"),
        ("partners", "postal_code"),
        ("partners", "province"),
        ("companies", "phone"),
        ("companies", "email"),
        ("companies", "address"),
        ("companies", "postal_code"),
        ("companies", "city"),
        ("companies", "province"),
    ]:
        op.execute(text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS {col}"))
