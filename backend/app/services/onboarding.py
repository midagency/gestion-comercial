"""
Servicio del Asistente de Configuración Didáctico.

Aquí vive la lógica que recomienda módulos, crea la estructura inicial
y genera datos de ejemplo según el tipo de negocio.
"""

from typing import List
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, create_refresh_token, hash_password
from app.models.company import Branch, Company, Warehouse
from app.models.partner import Partner
from app.models.product import PriceList, Product, ProductCategory
from app.models.user import Role, User
from app.schemas.onboarding import (
    BusinessType,
    ModuleRecommendation,
    OnboardingComplete,
)


# ---------------------------------------------------------------------------
# Recomendaciones didácticas de módulos según tipo de negocio
# ---------------------------------------------------------------------------

MODULE_CATALOG = {
    "crm": {
        "name": "Clientes y CRM",
        "description": "Gestión de clientes, prospectos, historial e interacciones.",
    },
    "catalog": {
        "name": "Catálogo de productos y servicios",
        "description": "Productos, servicios, variantes y listas de precios.",
    },
    "inventory": {
        "name": "Inventario / Almacén",
        "description": "Control de stock multi-almacén, movimientos y alertas.",
    },
    "sales": {
        "name": "Ventas y Facturación",
        "description": "Cotizaciones, pedidos, facturas y cobros.",
    },
    "purchases": {
        "name": "Compras y Proveedores",
        "description": "Órdenes de compra, recepción y facturas de proveedores.",
    },
    "pos": {
        "name": "Punto de Venta (POS)",
        "description": "Caja rápida para tiendas físicas. Ideal para retail.",
    },
    "projects": {
        "name": "Proyectos y Servicios",
        "description": "Control de horas, partes de trabajo y facturación por proyecto.",
    },
    "subscriptions": {
        "name": "Suscripciones y Contratos",
        "description": "Facturación recurrente y renovaciones automáticas.",
    },
}


def get_module_recommendations(business_type: BusinessType) -> List[ModuleRecommendation]:
    """
    Devuelve la lista de módulos con recomendación clara y justificación.
    Esta función es el corazón didáctico del Paso 4.
    """
    recommendations: List[ModuleRecommendation] = []

    # Siempre recomendados
    always = ["crm", "catalog", "sales"]
    for key in always:
        info = MODULE_CATALOG[key]
        recommendations.append(
            ModuleRecommendation(
                key=key,
                name=info["name"],
                description=info["description"],
                recommended=True,
                highly_recommended=True,
                reason="Esencial para cualquier tipo de negocio.",
            )
        )

    # Según rubro
    if business_type in (BusinessType.retail, BusinessType.mixed):
        recommendations.append(
            ModuleRecommendation(
                key="inventory",
                name=MODULE_CATALOG["inventory"]["name"],
                description=MODULE_CATALOG["inventory"]["description"],
                recommended=True,
                highly_recommended=True,
                reason="En retail es crítico saber qué tenés en cada local para no vender de más.",
            )
        )
        recommendations.append(
            ModuleRecommendation(
                key="pos",
                name=MODULE_CATALOG["pos"]["name"],
                description=MODULE_CATALOG["pos"]["description"],
                recommended=True,
                highly_recommended=True,
                reason="El POS te permite cobrar rápido en mostrador y sincronizar el stock al instante.",
            )
        )
        recommendations.append(
            ModuleRecommendation(
                key="purchases",
                name=MODULE_CATALOG["purchases"]["name"],
                description=MODULE_CATALOG["purchases"]["description"],
                recommended=True,
                highly_recommended=False,
                reason="Te ayuda a reponer mercadería a tiempo y llevar historial de proveedores.",
            )
        )

    if business_type in (BusinessType.wholesale, BusinessType.manufacturing, BusinessType.mixed):
        recommendations.append(
            ModuleRecommendation(
                key="inventory",
                name=MODULE_CATALOG["inventory"]["name"],
                description=MODULE_CATALOG["inventory"]["description"],
                recommended=True,
                highly_recommended=True,
                reason="Como mayorista o fabricante necesitás control preciso de stock y lotes.",
            )
        )
        recommendations.append(
            ModuleRecommendation(
                key="purchases",
                name=MODULE_CATALOG["purchases"]["name"],
                description=MODULE_CATALOG["purchases"]["description"],
                recommended=True,
                highly_recommended=True,
                reason="La gestión de compras es central en este tipo de operación.",
            )
        )

    if business_type == BusinessType.ecommerce:
        recommendations.append(
            ModuleRecommendation(
                key="inventory",
                name=MODULE_CATALOG["inventory"]["name"],
                description=MODULE_CATALOG["inventory"]["description"],
                recommended=True,
                highly_recommended=True,
                reason="En e-commerce el stock debe estar siempre actualizado para no vender lo que no tenés.",
            )
        )

    if business_type == BusinessType.services:
        recommendations.append(
            ModuleRecommendation(
                key="projects",
                name=MODULE_CATALOG["projects"]["name"],
                description=MODULE_CATALOG["projects"]["description"],
                recommended=True,
                highly_recommended=True,
                reason="Te permite llevar el control de horas y facturar por avance de proyecto.",
            )
        )
        recommendations.append(
            ModuleRecommendation(
                key="subscriptions",
                name=MODULE_CATALOG["subscriptions"]["name"],
                description=MODULE_CATALOG["subscriptions"]["description"],
                recommended=True,
                highly_recommended=False,
                reason="Si cobrás mensualmente (mantenimiento, SaaS, etc.) este módulo te ahorra mucho trabajo.",
            )
        )

    # Módulos no recomendados explícitamente (para que el usuario los vea)
    already = {r.key for r in recommendations}
    for key, info in MODULE_CATALOG.items():
        if key not in already:
            recommendations.append(
                ModuleRecommendation(
                    key=key,
                    name=info["name"],
                    description=info["description"],
                    recommended=False,
                    highly_recommended=False,
                    reason="No es prioritario para tu tipo de negocio, pero podés activarlo si lo necesitás.",
                )
            )

    return recommendations


def get_default_price_lists(business_type: BusinessType) -> list[dict]:
    """Listas de precios sugeridas según el rubro."""
    if business_type == BusinessType.retail:
        return [
            {"name": "Público / Minorista", "currency_code": "ARS", "is_default": True},
            {"name": "Mayorista", "currency_code": "ARS", "is_default": False},
        ]
    if business_type == BusinessType.wholesale:
        return [
            {"name": "Mayorista", "currency_code": "ARS", "is_default": True},
            {"name": "Distribuidor", "currency_code": "ARS", "is_default": False},
        ]
    if business_type == BusinessType.services:
        return [
            {"name": "Servicios estándar", "currency_code": "ARS", "is_default": True},
        ]
    # default / mixed / ecommerce
    return [
        {"name": "General", "currency_code": "ARS", "is_default": True},
    ]


def get_default_roles() -> list[dict]:
    """Roles iniciales con permisos básicos."""
    return [
        {
            "name": "Administrador",
            "description": "Acceso total al sistema",
            "is_system": True,
            "permissions": ["*"],
        },
        {
            "name": "Vendedor",
            "description": "Clientes, cotizaciones, pedidos y facturas",
            "is_system": True,
            "permissions": [
                "crm.view", "crm.create", "crm.edit",
                "sales.view", "sales.create", "sales.edit",
                "catalog.view",
            ],
        },
        {
            "name": "Cajero",
            "description": "Solo punto de venta y caja",
            "is_system": True,
            "permissions": ["pos.view", "pos.create", "cash.view", "cash.create"],
        },
        {
            "name": "Depósito",
            "description": "Inventario y movimientos de stock",
            "is_system": True,
            "permissions": ["inventory.view", "inventory.create", "inventory.edit"],
        },
        {
            "name": "Solo lectura",
            "description": "Puede ver reportes y datos, pero no modificar",
            "is_system": True,
            "permissions": ["*.view"],
        },
    ]


# ---------------------------------------------------------------------------
# Ejecución del onboarding completo
# ---------------------------------------------------------------------------

async def complete_onboarding(db: AsyncSession, data: OnboardingComplete) -> dict:
    """
    Crea la empresa, estructura inicial, usuario administrador y datos de ejemplo.
    Devuelve tokens para que el frontend redirija al dashboard.
    """

    # 1. Empresa
    company = Company(
        name=data.step2.name,
        legal_name=data.step2.legal_name,
        tax_id=data.step2.tax_id,
        country_code=data.step2.country_code,
        currency_code=data.step2.currency_code,
        province=data.step2.province,
        city=data.step2.city,
        postal_code=data.step2.postal_code,
        address=data.step2.address,
        email=str(data.step2.email) if data.step2.email else None,
        phone=data.step2.phone,
        business_type=data.step1.business_type.value,
        settings={
            "enabled_modules": data.step4.enabled_modules,
            "tax_rates": [t.model_dump() for t in data.step6.tax_rates],
            "sequences": [s.model_dump() for s in data.step6.sequences],
            "onboarding_completed": True,
        },
    )
    db.add(company)
    await db.flush()  # obtenemos company.id

    # 2. Sucursales
    created_branches: list[Branch] = []
    if data.step3.has_multiple_locations and data.step3.branches:
        for i, b in enumerate(data.step3.branches):
            branch = Branch(
                company_id=company.id,
                name=b.name,
                code=b.code,
                address=b.address,
                city=b.city,
                is_main=b.is_main or i == 0,
            )
            db.add(branch)
            created_branches.append(branch)
    else:
        # Una sola sucursal por defecto
        branch = Branch(
            company_id=company.id,
            name="Sucursal Principal",
            code="MAIN",
            address=data.step2.address,
            city=data.step2.city,
            is_main=True,
        )
        db.add(branch)
        created_branches.append(branch)

    await db.flush()

    # 3. Almacenes — un solo almacén por defecto; solo varios si el usuario los define
    if data.step3.has_multiple_locations and data.step3.warehouses:
        for i, w in enumerate(data.step3.warehouses):
            branch_id = created_branches[0].id
            if w.branch_index is not None and 0 <= w.branch_index < len(created_branches):
                branch_id = created_branches[w.branch_index].id
            warehouse = Warehouse(
                company_id=company.id,
                branch_id=branch_id,
                name=w.name or f"Almacén {i + 1}",
                code=w.code or f"WH-{i + 1:02d}",
                is_main=w.is_main if w.is_main is not None else (i == 0),
            )
            db.add(warehouse)
    else:
        # Una sola ubicación → un solo almacén
        warehouse = Warehouse(
            company_id=company.id,
            branch_id=created_branches[0].id,
            name="Almacén Principal",
            code="WH-01",
            is_main=True,
        )
        db.add(warehouse)

    # 4. Roles
    admin_role = None
    for r in get_default_roles():
        role = Role(
            company_id=company.id,
            name=r["name"],
            description=r["description"],
            is_system=r["is_system"],
            permissions=r["permissions"],
        )
        db.add(role)
        if r["name"] == "Administrador":
            admin_role = role
    await db.flush()

    # 5. Usuario owner
    user = User(
        company_id=company.id,
        email=data.step7.email.lower(),
        password_hash=hash_password(data.step7.password),
        first_name=data.step7.first_name,
        last_name=data.step7.last_name,
        phone=data.step7.phone,
        role_id=admin_role.id if admin_role else None,
        is_owner=True,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # 6. Listas de precios
    from app.schemas.onboarding import PriceListInput

    price_lists_data = data.step5.price_lists
    if not price_lists_data:
        price_lists_data = [
            PriceListInput(**pl) for pl in get_default_price_lists(data.step1.business_type)
        ]

    for pl in price_lists_data:
        db.add(
            PriceList(
                company_id=company.id,
                name=pl.name,
                currency_code=pl.currency_code,
                is_default=pl.is_default,
            )
        )

    # 7. Datos de ejemplo (didácticos)
    demo_created = False
    if True:  # siempre creamos un mínimo de ejemplo
        demo_created = True
        # Categoría
        cat = ProductCategory(company_id=company.id, name="General")
        db.add(cat)
        await db.flush()

        # Producto de ejemplo
        product = Product(
            company_id=company.id,
            category_id=cat.id,
            sku="DEMO-001",
            name="Producto de ejemplo",
            description="Este es un producto de demostración. Podés editarlo o eliminarlo.",
            product_type="product",
            track_stock=("inventory" in data.step4.enabled_modules),
            unit="unit",
        )
        db.add(product)

        # Cliente de ejemplo
        partner = Partner(
            company_id=company.id,
            partner_type="customer",
            name="Cliente de ejemplo",
            email="cliente@ejemplo.com",
            notes="Cliente creado automáticamente para que explores el sistema.",
        )
        db.add(partner)

    # Consumidor Final (siempre, para ventas de mostrador / ticket)
    existing_cf = await db.execute(
        select(Partner).where(
            Partner.company_id == company.id,
            Partner.name == "Consumidor Final",
        )
    )
    if not existing_cf.scalar_one_or_none():
        db.add(
            Partner(
                company_id=company.id,
                partner_type="customer",
                name="Consumidor Final",
                legal_name="Consumidor Final",
                tax_id="00-00000000-0",
                notes="Cliente genérico para ventas de mostrador / sin identificar.",
            )
        )

    await db.commit()

    # Tokens
    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))

    return {
        "company_id": company.id,
        "user_id": user.id,
        "access_token": access,
        "refresh_token": refresh,
        "message": "¡Configuración completada! Ya podés empezar a usar el sistema.",
        "demo_data_created": demo_created,
    }
