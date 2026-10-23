"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Store,
  Building2,
  MapPin,
  Puzzle,
  Tags,
  FileText,
  UserPlus,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  completeOnboarding,
  getModuleRecommendations,
  getDefaultPriceLists,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";

const BUSINESS_TYPES = [
  { value: "retail", label: "Comercio minorista", desc: "Tienda física, kiosco, local" },
  { value: "wholesale", label: "Mayorista / Distribuidora", desc: "Venta a otros comercios" },
  { value: "ecommerce", label: "E-commerce", desc: "Tienda online" },
  { value: "services", label: "Empresa de servicios", desc: "Consultoría, mantenimiento, etc." },
  { value: "manufacturing", label: "Fabricación", desc: "Producción ligera" },
  { value: "mixed", label: "Mixto", desc: "Combinación de varios" },
];

const STEPS = [
  { id: 1, title: "Tipo de negocio", icon: Store },
  { id: 2, title: "Datos de empresa", icon: Building2 },
  { id: 3, title: "Sucursales", icon: MapPin },
  { id: 4, title: "Módulos", icon: Puzzle },
  { id: 5, title: "Precios", icon: Tags },
  { id: 6, title: "Impuestos", icon: FileText },
  { id: 7, title: "Tu usuario", icon: UserPlus },
  { id: 8, title: "Confirmar", icon: CheckCircle2 },
];

interface ModuleRec {
  key: string;
  name: string;
  description: string;
  recommended: boolean;
  highly_recommended: boolean;
  reason: string;
}

const FALLBACK_MODULES: ModuleRec[] = [
  { key: "sales", name: "Ventas", description: "Pedidos, facturas, notas de crédito y cobros.", recommended: true, highly_recommended: true, reason: "Esencial" },
  { key: "purchases", name: "Compras", description: "Órdenes de compra, recepción y facturas de proveedor.", recommended: true, highly_recommended: false, reason: "Recomendado" },
  { key: "inventory", name: "Inventario", description: "Stock, almacenes y movimientos.", recommended: true, highly_recommended: true, reason: "Recomendado" },
  { key: "treasury", name: "Caja y bancos", description: "Caja, cuentas bancarias y cheques.", recommended: true, highly_recommended: false, reason: "Recomendado" },
  { key: "accounting", name: "Contabilidad", description: "Plan de cuentas, asientos y reportes.", recommended: false, highly_recommended: false, reason: "Opcional" },
  { key: "pos", name: "Punto de venta", description: "Venta rápida de mostrador.", recommended: false, highly_recommended: false, reason: "Opcional" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step data
  const [businessType, setBusinessType] = useState("retail");
  const [company, setCompany] = useState({
    name: "",
    legal_name: "",
    tax_id: "",
    country_code: "AR",
    currency_code: "ARS",
    province: "",
    city: "",
    postal_code: "",
    address: "",
    email: "",
    phone: "",
  });
  const [hasMultiple, setHasMultiple] = useState(false);
  const [modules, setModules] = useState<ModuleRec[]>(FALLBACK_MODULES);
  const [enabledModules, setEnabledModules] = useState<string[]>(() =>
    FALLBACK_MODULES.filter((r) => r.recommended).map((r) => r.key)
  );
  const [priceLists, setPriceLists] = useState<{ name: string; currency_code: string; is_default: boolean }[]>([]);
  const [taxRates, setTaxRates] = useState([{ name: "IVA 21%", rate: 21, is_default: true }]);
  const [user, setUserForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
    phone: "",
  });

  // Módulos y listas al instante (sin esperar al cold start de la API)
  useEffect(() => {
    if (step === 4) {
      setModules(FALLBACK_MODULES);
      setEnabledModules(
        FALLBACK_MODULES.filter((r) => r.recommended).map((r) => r.key)
      );
      // Opcional: enriquecer desde API con timeout corto (no bloquea la UI)
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 4000);
      getModuleRecommendations(businessType)
        .then((recs: ModuleRec[]) => {
          if (Array.isArray(recs) && recs.length > 0) {
            setModules(recs);
            setEnabledModules(recs.filter((r) => r.recommended).map((r) => r.key));
          }
        })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
      return () => {
        clearTimeout(timer);
        ac.abort();
      };
    }
    if (step === 5) {
      setPriceLists([{ name: "General", currency_code: "ARS", is_default: true }]);
      getDefaultPriceLists(businessType)
        .then((lists) => {
          if (Array.isArray(lists) && lists.length > 0) setPriceLists(lists);
        })
        .catch(() => {});
    }
  }, [step, businessType]);

  function toggleModule(key: string) {
    setEnabledModules((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleFinish() {
    setLoading(true);
    setError("");
    try {
      const payload = {
        step1: { business_type: businessType },
        step2: company,
        step3: {
          has_multiple_locations: hasMultiple,
          branches: hasMultiple
            ? [{ name: "Sucursal Principal", is_main: true, address: company.address, city: company.city }]
            : [],
          warehouses: [],
        },
        step4: { enabled_modules: enabledModules },
        step5: { price_lists: priceLists },
        step6: {
          tax_rates: taxRates,
          sequences: [
            { document_type: "invoice", prefix: "FAC", next_number: 1, padding: 5 },
            { document_type: "quotation", prefix: "COT", next_number: 1, padding: 5 },
            { document_type: "order", prefix: "PED", next_number: 1, padding: 5 },
          ],
        },
        step7: user,
      };
      const result = await completeOnboarding(payload);
      setTokens(result.access_token, result.refresh_token);
      setUser({
        id: result.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        company_id: result.company_id,
        is_owner: true,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Error al completar la configuración");
    } finally {
      setLoading(false);
    }
  }

  const tipByStep: Record<number, string> = {
    1: "El tipo de negocio determina qué módulos te recomendamos y cómo se configuran las listas de precios.",
    2: "El logo y los datos fiscales se usarán en facturas y documentos. Podés cambiarlos después.",
    3: "Cada almacén tiene su propio stock. Si tenés un solo local, lo creamos automáticamente.",
    4: "Podés activar o desactivar módulos cuando quieras. Las recomendaciones se basan en tu rubro.",
    5: "Las listas de precios permiten vender el mismo producto a distinto valor según el cliente.",
    6: "La numeración de documentos es correlativa e irreversible. El sistema la gestiona solo.",
    7: "Este usuario será el administrador de la empresa. Después podés invitar a tu equipo.",
    8: "Al finalizar creamos datos de ejemplo para que explores el sistema de inmediato.",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Progress */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Store className="h-6 w-6 text-brand-600" />
              <span className="font-bold text-slate-900">Configuración inicial</span>
            </div>
            <span className="text-sm text-slate-500">
              Paso {step} de {STEPS.length}
            </span>
          </div>
          <div className="flex gap-1">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  s.id <= step ? "bg-brand-600" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Tip */}
        <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Lightbulb className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">{tipByStep[step]}</p>
        </div>

        <div className="card p-6 sm:p-8">
          {/* Step 1 */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900">¿Qué tipo de negocio tenés?</h2>
              <p className="mt-1 text-sm text-slate-500">
                Esto define las recomendaciones de los siguientes pasos.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt.value}
                    type="button"
                    onClick={() => setBusinessType(bt.value)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      businessType === bt.value
                        ? "border-brand-600 bg-brand-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <p className="font-semibold text-slate-900">{bt.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{bt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900">Datos de tu empresa</h2>
              <p className="mt-1 text-sm text-slate-500">Datos fiscales y de contacto.</p>
              <div className="mt-6 space-y-4">
                <Input
                  label="Nombre comercial *"
                  value={company.name}
                  onChange={(e) => setCompany({ ...company, name: e.target.value })}
                  placeholder="Mi Empresa"
                  required
                />
                <Input
                  label="Razón social"
                  value={company.legal_name}
                  onChange={(e) => setCompany({ ...company, legal_name: e.target.value })}
                />
                <Input
                  label="CUIT / NIF / RFC"
                  value={company.tax_id}
                  onChange={(e) => setCompany({ ...company, tax_id: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="País"
                    value={company.country_code}
                    onChange={(e) => setCompany({ ...company, country_code: e.target.value })}
                    options={[
                      { value: "AR", label: "Argentina" },
                      { value: "UY", label: "Uruguay" },
                      { value: "CL", label: "Chile" },
                      { value: "PY", label: "Paraguay" },
                      { value: "BR", label: "Brasil" },
                      { value: "MX", label: "México" },
                      { value: "ES", label: "España" },
                    ]}
                  />
                  <Input
                    label="Moneda"
                    value={company.currency_code}
                    onChange={(e) => setCompany({ ...company, currency_code: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Provincia"
                    value={company.province}
                    onChange={(e) => setCompany({ ...company, province: e.target.value })}
                    placeholder="Buenos Aires"
                  />
                  <Input
                    label="Ciudad"
                    value={company.city}
                    onChange={(e) => setCompany({ ...company, city: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Código postal"
                    value={company.postal_code}
                    onChange={(e) => setCompany({ ...company, postal_code: e.target.value })}
                  />
                  <Input
                    label="Teléfono"
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  />
                </div>
                <Input
                  label="Domicilio fiscal"
                  value={company.address}
                  onChange={(e) => setCompany({ ...company, address: e.target.value })}
                />
                <Input
                  label="Email de la empresa"
                  type="email"
                  value={company.email}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900">Sucursales y almacenes</h2>
              <p className="mt-1 text-sm text-slate-500">
                ¿Tenés una sola ubicación o varias?
              </p>
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => setHasMultiple(false)}
                  className={`w-full rounded-xl border-2 p-4 text-left ${
                    !hasMultiple ? "border-brand-600 bg-brand-50" : "border-slate-200"
                  }`}
                >
                  <p className="font-semibold">Una sola ubicación</p>
                  <p className="text-xs text-slate-500">Creamos Sucursal y Almacén Principal automáticamente</p>
                </button>
                <button
                  type="button"
                  onClick={() => setHasMultiple(true)}
                  className={`w-full rounded-xl border-2 p-4 text-left ${
                    hasMultiple ? "border-brand-600 bg-brand-50" : "border-slate-200"
                  }`}
                >
                  <p className="font-semibold">Varias sucursales / almacenes</p>
                  <p className="text-xs text-slate-500">Podrás cargarlos después desde la configuración</p>
                </button>
              </div>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900">¿Qué módulos necesitás?</h2>
              <p className="mt-1 text-sm text-slate-500">
                Recomendados según tu rubro. Podés cambiarlos después.
              </p>
              <div className="mt-6 space-y-2 max-h-96 overflow-y-auto">
                {modules.map((m) => (
                  <label
                    key={m.key}
                    className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      enabledModules.includes(m.key)
                        ? "border-brand-300 bg-brand-50"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={enabledModules.includes(m.key)}
                      onChange={() => toggleModule(m.key)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{m.name}</span>
                        {Boolean(m.highly_recommended) && (
                          <span className="badge bg-green-100 text-green-700">Recomendado</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>
                      <p className="text-xs text-slate-400 mt-1 italic">{m.reason}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 5 */}
          {step === 5 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900">Listas de precios</h2>
              <p className="mt-1 text-sm text-slate-500">
                Sugeridas para tu tipo de negocio. Podés agregar más después.
              </p>
              <div className="mt-6 space-y-2">
                {priceLists.map((pl, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{pl.name}</p>
                      <p className="text-xs text-slate-500">{pl.currency_code}</p>
                    </div>
                    {Boolean(pl.is_default) && (
                      <span className="badge bg-brand-100 text-brand-700">Por defecto</span>
                    )}
                  </div>
                ))}
                {priceLists.length === 0 && (
                  <p className="text-sm text-slate-500">Se creará una lista &quot;General&quot; automáticamente.</p>
                )}
              </div>
            </div>
          )}

          {/* Step 6 */}
          {step === 6 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900">Impuestos y numeración</h2>
              <p className="mt-1 text-sm text-slate-500">
                IVA por defecto y prefijos de documentos.
              </p>
              <div className="mt-6 space-y-4">
                <p className="text-sm font-medium text-slate-700">Alícuotas de IVA</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { name: "IVA 21%", rate: 21 },
                    { name: "IVA 10,5%", rate: 10.5 },
                    { name: "IVA 27%", rate: 27 },
                    { name: "IVA 2,5%", rate: 2.5 },
                    { name: "Exento", rate: 0 },
                  ].map((opt) => {
                    const selected = taxRates.some((t) => t.rate === opt.rate);
                    return (
                      <button
                        key={opt.rate}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            const next = taxRates.filter((t) => t.rate !== opt.rate);
                            setTaxRates(next.length ? next : [{ name: opt.name, rate: opt.rate, is_default: true }]);
                          } else {
                            const next = [
                              ...taxRates.map((t) => ({ ...t, is_default: false })),
                              { name: opt.name, rate: opt.rate, is_default: taxRates.length === 0 },
                            ];
                            if (!next.some((t) => t.is_default)) next[0].is_default = true;
                            setTaxRates(next);
                          }
                        }}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          selected
                            ? "border-brand-600 bg-brand-50 text-brand-800"
                            : "border-slate-200 text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {opt.name}
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-lg border border-slate-200 divide-y">
                  {taxRates.map((tr, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{tr.name} ({tr.rate}%)</span>
                      {tr.is_default && (
                        <span className="text-xs text-brand-700 font-medium">Por defecto</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  Numeración automática: <strong>FAC-00001</strong>, <strong>COT-00001</strong>,{" "}
                  <strong>PED-00001</strong>
                </div>
              </div>
            </div>
          )}

          {/* Step 7 */}
          {step === 7 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900">Tu usuario administrador</h2>
              <p className="mt-1 text-sm text-slate-500">
                Vas a ser el dueño de la cuenta de la empresa.
              </p>
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Nombre *"
                    value={user.first_name}
                    onChange={(e) => setUserForm({ ...user, first_name: e.target.value })}
                    required
                  />
                  <Input
                    label="Apellido"
                    value={user.last_name}
                    onChange={(e) => setUserForm({ ...user, last_name: e.target.value })}
                  />
                </div>
                <Input
                  label="Email *"
                  type="email"
                  value={user.email}
                  onChange={(e) => setUserForm({ ...user, email: e.target.value })}
                  required
                />
                <Input
                  label="Contraseña *"
                  type="password"
                  value={user.password}
                  onChange={(e) => setUserForm({ ...user, password: e.target.value })}
                  hint="Mínimo 8 caracteres"
                  required
                />
              </div>
            </div>
          )}

          {/* Step 8 */}
          {step === 8 && (
            <div>
              <h2 className="text-xl font-bold text-slate-900">Resumen y confirmación</h2>
              <p className="mt-1 text-sm text-slate-500">Revisá la configuración antes de finalizar.</p>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">Tipo de negocio</span>
                  <span className="font-medium">
                    {BUSINESS_TYPES.find((b) => b.value === businessType)?.label}
                  </span>
                </div>
                <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">Empresa</span>
                  <span className="font-medium">{company.name || "—"}</span>
                </div>
                <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">Módulos activos</span>
                  <span className="font-medium">{enabledModules.length}</span>
                </div>
                <div className="flex justify-between rounded-lg bg-slate-50 px-4 py-3">
                  <span className="text-slate-500">Administrador</span>
                  <span className="font-medium">{user.email || "—"}</span>
                </div>
              </div>
              {error && (
                <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="mt-8 flex justify-between">
            <Button
              variant="secondary"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Atrás
            </Button>
            {step < 8 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={
                  (step === 2 && !company.name) ||
                  (step === 7 && (!user.email || !user.password || !user.first_name || user.password.length < 8))
                }
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleFinish} loading={loading}>
                Finalizar y entrar
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
