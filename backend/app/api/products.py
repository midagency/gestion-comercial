"""
CRUD de Catálogo: Categorías, Productos, Variantes y Listas de precios.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser, DBSession
from app.schemas.product import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    PriceListCreate,
    PriceListItemCreate,
    PriceListItemOut,
    PriceListItemUpdate,
    PriceListListResponse,
    PriceListOut,
    PriceListUpdate,
    ProductCreate,
    ProductListResponse,
    ProductOut,
    ProductUpdate,
    VariantCreate,
    VariantOut,
    VariantUpdate,
)
from app.services import product as product_service

router = APIRouter(tags=["Catálogo"])


# ===========================================================================
# CATEGORÍAS
# ===========================================================================

@router.get(
    "/categories",
    response_model=list[CategoryOut],
    summary="Listar categorías",
)
async def list_categories(db: DBSession, current_user: CurrentUser):
    cats = await product_service.list_categories(db, current_user.company_id)
    return [CategoryOut.model_validate(c) for c in cats]


@router.post(
    "/categories",
    response_model=CategoryOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear categoría",
)
async def create_category(
    data: CategoryCreate, db: DBSession, current_user: CurrentUser
):
    try:
        cat = await product_service.create_category(db, current_user.company_id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return CategoryOut.model_validate(cat)


@router.patch(
    "/categories/{category_id}",
    response_model=CategoryOut,
    summary="Actualizar categoría",
)
async def update_category(
    category_id: UUID,
    data: CategoryUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    cat = await product_service.get_category(db, current_user.company_id, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    try:
        cat = await product_service.update_category(db, cat, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return CategoryOut.model_validate(cat)


@router.delete(
    "/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar categoría",
)
async def delete_category(
    category_id: UUID, db: DBSession, current_user: CurrentUser
):
    cat = await product_service.get_category(db, current_user.company_id, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    await product_service.delete_category(db, cat)


# ===========================================================================
# PRODUCTOS
# ===========================================================================

@router.get(
    "/products",
    response_model=ProductListResponse,
    summary="Listar productos",
)
async def list_products(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Busca en nombre, SKU, código de barras, descripción"),
    category_id: Optional[UUID] = None,
    product_type: Optional[str] = Query(None, pattern="^(product|service|kit)$"),
    is_active: Optional[bool] = Query(True),
):
    result = await product_service.list_products(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        search=search,
        category_id=category_id,
        product_type=product_type,
        is_active=is_active,
    )
    return ProductListResponse(
        items=[ProductOut.model_validate(p) for p in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get(
    "/products/{product_id}",
    response_model=ProductOut,
    summary="Detalle de producto (incluye variantes)",
)
async def get_product(
    product_id: UUID, db: DBSession, current_user: CurrentUser
):
    product = await product_service.get_product(db, current_user.company_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return ProductOut.model_validate(product)


@router.post(
    "/products",
    response_model=ProductOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear producto (con variantes opcionales)",
)
async def create_product(
    data: ProductCreate, db: DBSession, current_user: CurrentUser
):
    try:
        product = await product_service.create_product(
            db, current_user.company_id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ProductOut.model_validate(product)


@router.patch(
    "/products/{product_id}",
    response_model=ProductOut,
    summary="Actualizar producto",
)
async def update_product(
    product_id: UUID,
    data: ProductUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    product = await product_service.get_product(db, current_user.company_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    try:
        product = await product_service.update_product(db, product, data)
        return ProductOut.model_validate(product)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar producto: {e}")


@router.delete(
    "/products/{product_id}",
    response_model=ProductOut,
    summary="Desactivar producto (baja lógica)",
)
async def delete_product(
    product_id: UUID, db: DBSession, current_user: CurrentUser
):
    product = await product_service.get_product(db, current_user.company_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if not product.is_active:
        raise HTTPException(status_code=400, detail="El producto ya está desactivado")
    product = await product_service.soft_delete_product(db, product)
    return ProductOut.model_validate(product)


@router.post(
    "/products/{product_id}/restore",
    response_model=ProductOut,
    summary="Reactivar producto",
)
async def restore_product(
    product_id: UUID, db: DBSession, current_user: CurrentUser
):
    product = await product_service.get_product(db, current_user.company_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if product.is_active:
        raise HTTPException(status_code=400, detail="El producto ya está activo")
    product = await product_service.restore_product(db, product)
    return ProductOut.model_validate(product)


# ===========================================================================
# VARIANTES
# ===========================================================================

@router.post(
    "/products/{product_id}/variants",
    response_model=VariantOut,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar variante a un producto",
)
async def add_variant(
    product_id: UUID,
    data: VariantCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    product = await product_service.get_product(db, current_user.company_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    variant = await product_service.add_variant(db, product, data)
    return VariantOut.model_validate(variant)


@router.patch(
    "/products/{product_id}/variants/{variant_id}",
    response_model=VariantOut,
    summary="Actualizar variante",
)
async def update_variant(
    product_id: UUID,
    variant_id: UUID,
    data: VariantUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    product = await product_service.get_product(db, current_user.company_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    variant = await product_service.get_variant(db, product_id, variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Variante no encontrada")
    variant = await product_service.update_variant(db, variant, data)
    return VariantOut.model_validate(variant)


@router.delete(
    "/products/{product_id}/variants/{variant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar variante",
)
async def delete_variant(
    product_id: UUID,
    variant_id: UUID,
    db: DBSession,
    current_user: CurrentUser,
):
    product = await product_service.get_product(db, current_user.company_id, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    variant = await product_service.get_variant(db, product_id, variant_id)
    if not variant:
        raise HTTPException(status_code=404, detail="Variante no encontrada")
    await product_service.delete_variant(db, variant)


# ===========================================================================
# LISTAS DE PRECIOS
# ===========================================================================

@router.get(
    "/price-lists",
    response_model=PriceListListResponse,
    summary="Listar listas de precios",
)
async def list_price_lists(
    db: DBSession,
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_active: Optional[bool] = Query(True),
):
    result = await product_service.list_price_lists(
        db,
        current_user.company_id,
        page=page,
        page_size=page_size,
        is_active=is_active,
    )
    return PriceListListResponse(
        items=[PriceListOut.model_validate(p) for p in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@router.get(
    "/price-lists/{price_list_id}",
    response_model=PriceListOut,
    summary="Detalle de lista de precios (incluye ítems)",
)
async def get_price_list(
    price_list_id: UUID, db: DBSession, current_user: CurrentUser
):
    pl = await product_service.get_price_list(
        db, current_user.company_id, price_list_id
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Lista de precios no encontrada")
    return PriceListOut.model_validate(pl)


@router.post(
    "/price-lists",
    response_model=PriceListOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear lista de precios",
)
async def create_price_list(
    data: PriceListCreate, db: DBSession, current_user: CurrentUser
):
    try:
        pl = await product_service.create_price_list(
            db, current_user.company_id, data
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return PriceListOut.model_validate(pl)


@router.patch(
    "/price-lists/{price_list_id}",
    response_model=PriceListOut,
    summary="Actualizar lista de precios",
)
async def update_price_list(
    price_list_id: UUID,
    data: PriceListUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    pl = await product_service.get_price_list(
        db, current_user.company_id, price_list_id
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Lista de precios no encontrada")
    pl = await product_service.update_price_list(db, pl, data)
    return PriceListOut.model_validate(pl)


@router.delete(
    "/price-lists/{price_list_id}",
    response_model=PriceListOut,
    summary="Desactivar lista de precios",
)
async def delete_price_list(
    price_list_id: UUID, db: DBSession, current_user: CurrentUser
):
    pl = await product_service.get_price_list(
        db, current_user.company_id, price_list_id
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Lista de precios no encontrada")
    pl = await product_service.soft_delete_price_list(db, pl)
    return PriceListOut.model_validate(pl)


@router.post(
    "/price-lists/{price_list_id}/items",
    response_model=PriceListItemOut,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar ítem a lista de precios",
)
async def add_price_list_item(
    price_list_id: UUID,
    data: PriceListItemCreate,
    db: DBSession,
    current_user: CurrentUser,
):
    pl = await product_service.get_price_list(
        db, current_user.company_id, price_list_id
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Lista de precios no encontrada")
    try:
        item = await product_service.add_price_list_item(db, pl, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return PriceListItemOut.model_validate(item)


@router.patch(
    "/price-lists/{price_list_id}/items/{item_id}",
    response_model=PriceListItemOut,
    summary="Actualizar ítem de lista de precios",
)
async def update_price_list_item(
    price_list_id: UUID,
    item_id: UUID,
    data: PriceListItemUpdate,
    db: DBSession,
    current_user: CurrentUser,
):
    pl = await product_service.get_price_list(
        db, current_user.company_id, price_list_id
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Lista de precios no encontrada")
    item = await product_service.get_price_list_item(db, price_list_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    item = await product_service.update_price_list_item(db, item, data)
    return PriceListItemOut.model_validate(item)


@router.delete(
    "/price-lists/{price_list_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar ítem de lista de precios",
)
async def delete_price_list_item(
    price_list_id: UUID,
    item_id: UUID,
    db: DBSession,
    current_user: CurrentUser,
):
    pl = await product_service.get_price_list(
        db, current_user.company_id, price_list_id
    )
    if not pl:
        raise HTTPException(status_code=404, detail="Lista de precios no encontrada")
    item = await product_service.get_price_list_item(db, price_list_id, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    await product_service.delete_price_list_item(db, item)
