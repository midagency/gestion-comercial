"""
Schemas del Asistente de Configuración Didáctico.
Cada paso tiene validación clara y campos con descripciones pensadas para el frontend.
"""

from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class BusinessType(str, Enum):
    retail = "retail"           # Comercio minorista
    wholesale = "wholesale"     # Mayorista / Distribuidora
    ecommerce = "ecommerce"     # Tienda online
    services = "services"       # Empresa de servicios
    manufacturing = "manufacturing"
    mixed = "mixed"


# ------------------------------------------------------------------
# Paso 1 – Tipo de negocio
# ------------------------------------------------------------------
class OnboardingStep1(BaseModel):
    business_type: BusinessType = Field(
        ...,
        description="Tipo de negocio. Determina las recomendaciones de los siguientes pasos."
    )


# ------------------------------------------------------------------
# Paso 2 – Datos de la empresa
# ------------------------------------------------------------------
class OnboardingStep2(BaseModel):
    name: str = Field(..., min_length=2, max_length=200, description="Nombre comercial")
    legal_name: Optional[str] = Field(None, max_length=250, description="Razón social")
    tax_id: Optional[str] = Field(None, max_length=50, description="CUIT / NIF / RFC")
    country_code: str = Field("AR", min_length=2, max_length=2)
    currency_code: str = Field("ARS", min_length=3, max_length=3)
    address: Optional[str] = None
    city: Optional[str] = None


# ------------------------------------------------------------------
# Paso 3 – Sucursales y almacenes
# ------------------------------------------------------------------
class BranchInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    code: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    is_main: bool = False


class WarehouseInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    code: Optional[str] = None
    branch_index: Optional[int] = Field(
        None, description="Índice de la sucursal a la que pertenece (0-based). Null = sin sucursal."
    )
    is_main: bool = False


class OnboardingStep3(BaseModel):
    has_multiple_locations: bool = Field(
        False,
        description="¿Tenés más de una sucursal o almacén?"
    )
    branches: List[BranchInput] = Field(default_factory=list)
    warehouses: List[WarehouseInput] = Field(default_factory=list)


# ------------------------------------------------------------------
# Paso 4 – Módulos
# ------------------------------------------------------------------
class ModuleRecommendation(BaseModel):
    key: str
    name: str
    description: str
    recommended: bool
    highly_recommended: bool = False
    reason: str


class OnboardingStep4(BaseModel):
    enabled_modules: List[str] = Field(
        ...,
        description="Lista de claves de módulos a activar. Ej: ['crm', 'inventory', 'pos']"
    )


# ------------------------------------------------------------------
# Paso 5 – Listas de precios
# ------------------------------------------------------------------
class PriceListInput(BaseModel):
    name: str
    currency_code: str = "ARS"
    is_default: bool = False


class OnboardingStep5(BaseModel):
    price_lists: List[PriceListInput] = Field(default_factory=list)


# ------------------------------------------------------------------
# Paso 6 – Impuestos y numeración
# ------------------------------------------------------------------
class TaxRateInput(BaseModel):
    name: str = Field(..., examples=["IVA 21%"])
    rate: float = Field(..., ge=0, le=100, examples=[21.0])
    is_default: bool = False


class DocumentSequenceInput(BaseModel):
    document_type: str = Field(..., examples=["invoice", "quotation", "order"])
    prefix: str = Field(..., examples=["FAC", "COT", "PED"])
    next_number: int = Field(1, ge=1)
    padding: int = Field(5, ge=1, le=10, description="Ceros a la izquierda. Ej: 5 → 00001")


class OnboardingStep6(BaseModel):
    tax_rates: List[TaxRateInput] = Field(default_factory=list)
    sequences: List[DocumentSequenceInput] = Field(default_factory=list)


# ------------------------------------------------------------------
# Paso 7 – Usuario administrador inicial
# ------------------------------------------------------------------
class OnboardingStep7(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: str = Field(..., min_length=1)
    last_name: Optional[str] = None
    phone: Optional[str] = None


# ------------------------------------------------------------------
# Estado completo del onboarding (lo que se envía al finalizar)
# ------------------------------------------------------------------
class OnboardingComplete(BaseModel):
    step1: OnboardingStep1
    step2: OnboardingStep2
    step3: OnboardingStep3
    step4: OnboardingStep4
    step5: OnboardingStep5
    step6: OnboardingStep6
    step7: OnboardingStep7


class OnboardingState(BaseModel):
    """Respuesta después de completar el onboarding."""
    company_id: UUID
    user_id: UUID
    access_token: str
    refresh_token: str
    message: str
    demo_data_created: bool
