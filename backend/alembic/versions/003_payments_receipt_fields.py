"""payment receipt bank check fields

Revision ID: 003_payments
Revises: 002_extend
Create Date: 2026-10-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "003_payments"
down_revision: Union[str, None] = "002_extend"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("bank_account_id", sa.UUID(), nullable=True))
    op.add_column("payments", sa.Column("check_id", sa.UUID(), nullable=True))
    op.add_column("payments", sa.Column("receipt_number", sa.String(40), nullable=True))
    op.create_foreign_key(
        "fk_payments_bank_account",
        "payments",
        "bank_accounts",
        ["bank_account_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_payments_check",
        "payments",
        "checks",
        ["check_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_payments_check", "payments", type_="foreignkey")
    op.drop_constraint("fk_payments_bank_account", "payments", type_="foreignkey")
    op.drop_column("payments", "receipt_number")
    op.drop_column("payments", "check_id")
    op.drop_column("payments", "bank_account_id")
