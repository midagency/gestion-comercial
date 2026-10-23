"""
Servicio de Catálogo: Categorías, Productos, Variantes y Listas de precios.
Todo filtrado por company_id.
"""

from math import ceil
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import (
    PriceList,
    PriceListItem,
    Product,
    ProductCategory,
    ProductVariant,
)
from app.schemas.product import (
    CategoryCreate,
    CategoryUpdate,
    PriceListCreate,
    PriceListItemCreate,
    PriceListItemUpdate,
    PriceListUpdate,
    ProductCreate,
    ProductUpdate,
    VariantCreate,
    VariantUpdate,
)


# ===========================================================================
# CATEGORÍAS
# ===========================================================================

async def list_categories(db: AsyncSession, company_id: UUID) -> list[ProductCategory]:
    result = await db.execute(
        select(ProductCategory)
        .where(ProductCategory.company_id == company_id)
        .order_by(ProductCategory.name)
    )
    return list(result.scalars().all())


async def get_category(
    db: AsyncSession, company_id: UUID, category_id: UUID
) -> Optional[ProductCategory]:
    result = await db.execute(
        select(ProductCategory).where(
            ProductCategory.id == category_id,
            ProductCategory.company_id == company_id,
        )
    )
    return result.scalar_one_or_none()


async def create_category(
    db: AsyncSession, company_id: UUID, data: CategoryCreate
) -> ProductCategory:
    if data.parent_id:
        parent = await get_category(db, company_id, data.parent_id)
        if not parent:
            raise ValueError("La categoría padre no existe")
    cat = ProductCategory(company_id=company_id, **data.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


async def update_category(
    db: AsyncSession, category: ProductCategory, data: CategoryUpdate
) -> ProductCategory:
    updates = data.model_dump(exclude_unset=True)
    if "parent_id" in updates and updates["parent_id"]:
        parent = await get_category(db, category.company_id, updates["parent_id"])
        if not parent:
            raise ValueError("La categoría padre no existe")
        if updates["parent_id"] == category.id:
            raise ValueError("Una categoría no puede ser padre de sí misma")
    for field, value in updates.items():
        setattr(category, field, value)
    await db.flush()
    await db.refresh(category)
    return category


async def delete_category(db: AsyncSession, category: ProductCategory) -> None:
    await db.delete(category)
    await db.flush()


# ===========================================================================
# PRODUCTOS
# ===========================================================================

async def list_products(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    category_id: Optional[UUID] = None,
    product_type: Optional[str] = None,
    is_active: Optional[bool] = True,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = (
        select(Product)
        .options(selectinload(Product.variants))
        .where(Product.company_id == company_id)
    )

    if is_active is not None:
        base = base.where(Product.is_active == is_active)
    if category_id:
        base = base.where(Product.category_id == category_id)
    if product_type:
        base = base.where(Product.product_type == product_type)
    if search:
        term = f"%{search.strip()}%"
        base = base.where(
            or_(
                Product.name.ilike(term),
                Product.sku.ilike(term),
                Product.barcode.ilike(term),
                Product.description.ilike(term),
            )
        )

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * page_size
    items_q = base.order_by(Product.name).offset(offset).limit(page_size)
    result = await db.execute(items_q)
    items = result.scalars().unique().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def get_product(
    db: AsyncSession, company_id: UUID, product_id: UUID
) -> Optional[Product]:
    result = await db.execute(
        select(Product)
        .options(selectinload(Product.variants))
        .where(Product.id == product_id, Product.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_product(
    db: AsyncSession, company_id: UUID, data: ProductCreate
) -> Product:
    if data.category_id:
        cat = await get_category(db, company_id, data.category_id)
        if not cat:
            raise ValueError("La categoría no existe")

    payload = data.model_dump(exclude={"variants"})
    product = Product(company_id=company_id, **payload)
    db.add(product)
    await db.flush()

    for v in data.variants:
        variant = ProductVariant(product_id=product.id, **v.model_dump())
        db.add(variant)

    await db.flush()
    await db.refresh(product, attribute_names=["variants"])
    return product


async def update_product(
    db: AsyncSession, product: Product, data: ProductUpdate
) -> Product:
    updates = data.model_dump(exclude_unset=True)
    if "category_id" in updates and updates["category_id"]:
        cat = await get_category(db, product.company_id, updates["category_id"])
        if not cat:
            raise ValueError("La categoría no existe")
    if "subcategory_id" in updates and updates["subcategory_id"]:
        sub = await get_category(db, product.company_id, updates["subcategory_id"])
        if not sub:
            raise ValueError("La subcategoría no existe")
    for field, value in updates.items():
        setattr(product, field, value)
    await db.flush()
    try:
        await db.refresh(product, attribute_names=["variants"])
    except Exception:
        await db.refresh(product)
    return product


async def soft_delete_product(db: AsyncSession, product: Product) -> Product:
    product.is_active = False
    await db.flush()
    await db.refresh(product)
    return product


async def restore_product(db: AsyncSession, product: Product) -> Product:
    product.is_active = True
    await db.flush()
    await db.refresh(product)
    return product


# ===========================================================================
# VARIANTES
# ===========================================================================

async def add_variant(
    db: AsyncSession, product: Product, data: VariantCreate
) -> ProductVariant:
    variant = ProductVariant(product_id=product.id, **data.model_dump())
    db.add(variant)
    await db.flush()
    await db.refresh(variant)
    return variant


async def get_variant(
    db: AsyncSession, product_id: UUID, variant_id: UUID
) -> Optional[ProductVariant]:
    result = await db.execute(
        select(ProductVariant).where(
            ProductVariant.id == variant_id,
            ProductVariant.product_id == product_id,
        )
    )
    return result.scalar_one_or_none()


async def update_variant(
    db: AsyncSession, variant: ProductVariant, data: VariantUpdate
) -> ProductVariant:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(variant, field, value)
    await db.flush()
    await db.refresh(variant)
    return variant


async def delete_variant(db: AsyncSession, variant: ProductVariant) -> None:
    await db.delete(variant)
    await db.flush()


# ===========================================================================
# LISTAS DE PRECIOS
# ===========================================================================

async def list_price_lists(
    db: AsyncSession,
    company_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
    is_active: Optional[bool] = True,
) -> dict:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = (
        select(PriceList)
        .options(selectinload(PriceList.items))
        .where(PriceList.company_id == company_id)
    )
    if is_active is not None:
        base = base.where(PriceList.is_active == is_active)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(
        base.order_by(PriceList.name).offset(offset).limit(page_size)
    )
    items = result.scalars().unique().all()

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": ceil(total / page_size) if page_size else 0,
    }


async def get_price_list(
    db: AsyncSession, company_id: UUID, price_list_id: UUID
) -> Optional[PriceList]:
    result = await db.execute(
        select(PriceList)
        .options(selectinload(PriceList.items))
        .where(PriceList.id == price_list_id, PriceList.company_id == company_id)
    )
    return result.scalar_one_or_none()


async def create_price_list(
    db: AsyncSession, company_id: UUID, data: PriceListCreate
) -> PriceList:
    # Si se marca como default, desmarcar las demás
    if data.is_default:
        await _unset_default_price_lists(db, company_id)

    pl = PriceList(
        company_id=company_id,
        name=data.name,
        currency_code=data.currency_code,
        discount_percent=data.discount_percent or 0,
        discount_amount=data.discount_amount or 0,
        is_default=data.is_default,
    )
    db.add(pl)
    await db.flush()

    for item in data.items:
        # Verificar que el producto pertenezca a la empresa
        prod = await get_product(db, company_id, item.product_id)
        if not prod:
            raise ValueError(f"Producto {item.product_id} no encontrado")
        db.add(
            PriceListItem(
                price_list_id=pl.id,
                product_id=item.product_id,
                variant_id=item.variant_id,
                price=item.price,
                min_qty=item.min_qty,
            )
        )

    await db.flush()
    await db.refresh(pl, attribute_names=["items"])
    return pl


async def update_price_list(
    db: AsyncSession, price_list: PriceList, data: PriceListUpdate
) -> PriceList:
    updates = data.model_dump(exclude_unset=True)
    if updates.get("is_default") is True:
        await _unset_default_price_lists(db, price_list.company_id)
    for field, value in updates.items():
        setattr(price_list, field, value)
    await db.flush()
    await db.refresh(price_list, attribute_names=["items"])
    return price_list


async def soft_delete_price_list(db: AsyncSession, price_list: PriceList) -> PriceList:
    price_list.is_active = False
    await db.flush()
    await db.refresh(price_list)
    return price_list


async def add_price_list_item(
    db: AsyncSession,
    price_list: PriceList,
    data: PriceListItemCreate,
) -> PriceListItem:
    prod = await get_product(db, price_list.company_id, data.product_id)
    if not prod:
        raise ValueError("Producto no encontrado")
    item = PriceListItem(
        price_list_id=price_list.id,
        product_id=data.product_id,
        variant_id=data.variant_id,
        price=data.price,
        min_qty=data.min_qty,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


async def update_price_list_item(
    db: AsyncSession, item: PriceListItem, data: PriceListItemUpdate
) -> PriceListItem:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.flush()
    await db.refresh(item)
    return item


async def delete_price_list_item(db: AsyncSession, item: PriceListItem) -> None:
    await db.delete(item)
    await db.flush()


async def get_price_list_item(
    db: AsyncSession, price_list_id: UUID, item_id: UUID
) -> Optional[PriceListItem]:
    result = await db.execute(
        select(PriceListItem).where(
            PriceListItem.id == item_id,
            PriceListItem.price_list_id == price_list_id,
        )
    )
    return result.scalar_one_or_none()


async def _unset_default_price_lists(db: AsyncSession, company_id: UUID) -> None:
    result = await db.execute(
        select(PriceList).where(
            PriceList.company_id == company_id,
            PriceList.is_default == True,  # noqa: E712
        )
    )
    for pl in result.scalars().all():
        pl.is_default = False
    await db.flush()
