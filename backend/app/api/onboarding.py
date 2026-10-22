"""
API del Asistente de Configuración Didáctico.

Endpoints pensados para que el frontend muestre un wizard paso a paso
con recomendaciones claras.
"""

from fastapi import APIRouter

from app.api.deps import DBSession
from app.schemas.onboarding import (
    BusinessType,
    ModuleRecommendation,
    OnboardingComplete,
    OnboardingState,
)
from app.services.onboarding import (
    complete_onboarding,
    get_default_price_lists,
    get_module_recommendations,
)

router = APIRouter(prefix="/onboarding", tags=["Onboarding Didáctico"])


@router.get(
    "/recommendations/{business_type}",
    response_model=list[ModuleRecommendation],
    summary="Obtener recomendaciones de módulos",
    description=(
        "Devuelve la lista de módulos con recomendación y justificación "
        "según el tipo de negocio. Usar en el Paso 4 del wizard."
    ),
)
async def module_recommendations(business_type: BusinessType):
    return get_module_recommendations(business_type)


@router.get(
    "/default-price-lists/{business_type}",
    summary="Listas de precios sugeridas",
    description="Devuelve las listas de precios recomendadas según el rubro (Paso 5).",
)
async def default_price_lists(business_type: BusinessType):
    return get_default_price_lists(business_type)


@router.post(
    "/complete",
    response_model=OnboardingState,
    summary="Finalizar el onboarding",
    description=(
        "Recibe todos los pasos del wizard, crea la empresa, la estructura inicial, "
        "el usuario administrador y datos de ejemplo. Devuelve tokens de acceso."
    ),
)
async def finish_onboarding(data: OnboardingComplete, db: DBSession):
    result = await complete_onboarding(db, data)
    return OnboardingState(**result)
