"""extend company partner product price_list fields

Revision ID: 002_extend
Revises: 001_initial
Create Date: 2026-10-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "002_extend"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # companies
    op.add_column("companies", sa.Column("province", sa.String(100), nullable=True))
    op.add_column("companies", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("companies", sa.Column("postal_code", sa.String(20), nullable=True))
    op.add_column("companies", sa.Column("address", sa.Text(), nullable=True))
    op.add_column("companies", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("companies", sa.Column("phone", sa.String(40), nullable=True))

    # partners
    op.add_column("partners", sa.Column("province", sa.String(100), nullable=True))
    op.add_column("partners", sa.Column("postal_code", sa.String(20), nullable=True))

    # products
    op.add_column(
        "products",
        sa.Column("subcategory_id", sa.UUID(), sa.ForeignKey("product_categories.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("products", sa.Column("brand", sa.String(120), nullable=True))

    # price_lists
    op.add_column(
        "price_lists",
        sa.Column("discount_percent", sa.Numeric(8, 4), server_default="0", nullable=True),
    )
    op.add_column(
        "price_lists",
        sa.Column("discount_amount", sa.Numeric(14, 2), server_default="0", nullable=True),
    )


def downgrade() -> None:
    op.drop_column("price_lists", "discount_amount")
    op.drop_column("price_lists", "discount_percent")
    op.drop_column("products", "brand")
    op.drop_column("products", "subcategory_id")
    op.drop_column("partners", "postal_code")
    op.drop_column("partners", "province")
    op.drop_column("companies", "phone")
    op.drop_column("companies", "email")
    op.drop_column("companies", "address")
    op.drop_column("companies", "postal_code")
    op.drop_column("companies", "city")
    op.drop_column("companies", "province")
