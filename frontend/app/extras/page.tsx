"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import {
  listOpportunities,
  createOpportunity,
  updateOpportunity,
  listActivities,
  createActivity,
  completeActivity,
  listLots,
  createLot,
  listSerials,
  createSerial,
  listBoms,
  createBom,
  listProductionOrders,
  createProductionOrder,
  completeProductionOrder,
  listCommissionRules,
  createCommissionRule,
  listCommissionEntries,
  listCurrencyRates,
  createCurrencyRate,
  convertCurrency,
  listWorkOrders,
  createWorkOrder,
  updateWorkOrder,
  listPaymentProviders,
  upsertPaymentProvider,
  listProducts,
  listPartners,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, X, Check } from "lucide-react";

type Tab =
  | "crm"
  | "lots"
  | "production"
  | "commissions"
  | "currency"
  | "workorders"
  | "payments";

const stages = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

export default function ExtrasPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("crm");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // CRM forms
  const [oppTitle, setOppTitle] = useState("");
  const [oppAmount, setOppAmount] = useState("");
  const [oppStage, setOppStage] = useState("lead");
  const [actSubject, setActSubject] = useState("");
  const [actType, setActType] = useState("task");

  // Lots
  const [lotProduct, setLotProduct] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [lotQty, setLotQty] = useState("1");
  const [lotExpiry, setLotExpiry] = useState("");
  const [serialProduct, setSerialProduct] = useState("");
  const [serialNumber, setSerialNumber] = useState("");

  // Production
  const [bomProduct, setBomProduct] = useState("");
  const [bomComponent, setBomComponent] = useState("");
  const [bomCompQty, setBomCompQty] = useState("1");
  const [prodBomId, setProdBomId] = useState("");
  const [prodQty, setProdQty] = useState("1");

  // Commission
  const [ruleName, setRuleName] = useState("");
  const [ruleRate, setRuleRate] = useState("5");

  // Currency
  const [fromCcy, setFromCcy] = useState("USD");
  const [toCcy, setToCcy] = useState("ARS");
  const [rateVal, setRateVal] = useState("");
  const [convertAmt, setConvertAmt] = useState("100");
  const [convertResult, setConvertResult] = useState("");

  // Work order
  const [woTitle, setWoTitle] = useState("");
  const [woPartner, setWoPartner] = useState("");

  // Payments
  const [provider, setProvider] = useState("mercadopago");
  const [publicKey, setPublicKey] = useState("");

  const { data: opportunities } = useQuery({
    queryKey: ["opportunities"],
    queryFn: () => listOpportunities(),
    enabled: tab === "crm",
  });
  const { data: activities } = useQuery({
    queryKey: ["activities"],
    queryFn: () => listActivities({ status: "pending" }),
    enabled: tab === "crm",
  });
  const { data: lots } = useQuery({
    queryKey: ["lots"],
    queryFn: () => listLots({ expiring_days: 90 }),
    enabled: tab === "lots",
  });
  const { data: serials } = useQuery({
    queryKey: ["serials"],
    queryFn: () => listSerials(),
    enabled: tab === "lots",
  });
  const { data: boms } = useQuery({
    queryKey: ["boms"],
    queryFn: listBoms,
    enabled: tab === "production",
  });
  const { data: production } = useQuery({
    queryKey: ["production-orders"],
    queryFn: listProductionOrders,
    enabled: tab === "production",
  });
  const { data: rules } = useQuery({
    queryKey: ["commission-rules"],
    queryFn: listCommissionRules,
    enabled: tab === "commissions",
  });
  const { data: commissionEntries } = useQuery({
    queryKey: ["commission-entries"],
    queryFn: () => listCommissionEntries(),
    enabled: tab === "commissions",
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates"],
    queryFn: listCurrencyRates,
    enabled: tab === "currency",
  });
  const { data: workOrders } = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => listWorkOrders(),
    enabled: tab === "workorders",
  });
  const { data: providers } = useQuery({
    queryKey: ["payment-providers"],
    queryFn: listPaymentProviders,
    enabled: tab === "payments",
  });
  const { data: products } = useQuery({
    queryKey: ["products-extras"],
    queryFn: () => listProducts({ page_size: 100 }),
  });
  const { data: partners } = useQuery({
    queryKey: ["partners-extras"],
    queryFn: () => listPartners({ page_size: 100 }),
  });

  const onErr = (e: unknown) => {
    setError(
      (e as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail || "Error"
    );
  };

  const oppMut = useMutation({
    mutationFn: createOpportunity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      setOppTitle("");
      setOppAmount("");
      setMsg("Oportunidad creada");
    },
    onError: onErr,
  });

  const actMut = useMutation({
    mutationFn: createActivity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] });
      setActSubject("");
    },
  });

  const lotMut = useMutation({
    mutationFn: createLot,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lots"] });
      setLotNumber("");
      setMsg("Lote registrado");
    },
    onError: onErr,
  });

  const serialMut = useMutation({
    mutationFn: createSerial,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["serials"] });
      setSerialNumber("");
    },
    onError: onErr,
  });

  const bomMut = useMutation({
    mutationFn: createBom,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boms"] });
      setMsg("BOM creada");
    },
    onError: onErr,
  });

  const prodMut = useMutation({
    mutationFn: createProductionOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders"] });
    },
    onError: onErr,
  });

  const completeProd = useMutation({
    mutationFn: completeProductionOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production-orders"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      setMsg("Producción completada (stock actualizado)");
    },
    onError: onErr,
  });

  const ruleMut = useMutation({
    mutationFn: createCommissionRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["commission-rules"] });
      setRuleName("");
    },
  });

  const rateMut = useMutation({
    mutationFn: createCurrencyRate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["currency-rates"] });
      setRateVal("");
    },
  });

  const woMut = useMutation({
    mutationFn: createWorkOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      setWoTitle("");
    },
  });

  const payMut = useMutation({
    mutationFn: upsertPaymentProvider,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment-providers"] });
      setMsg("Proveedor de pago guardado");
    },
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "crm", label: "CRM" },
    { id: "lots", label: "Lotes / Series" },
    { id: "production", label: "Producción" },
    { id: "commissions", label: "Comisiones" },
    { id: "currency", label: "Monedas" },
    { id: "workorders", label: "Órdenes de trabajo" },
    { id: "payments", label: "Pagos online" },
  ];

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Módulos extra</h1>
        <p className="mt-1 text-sm text-slate-500">
          CRM · lotes · producción · comisiones · multi-moneda · OT · pagos
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setError("");
              setMsg("");
            }}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {msg && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
          {msg}
        </div>
      )}

      {/* CRM */}
      {tab === "crm" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle>Nueva oportunidad</CardTitle>
            <div className="mt-3 space-y-2">
              <Input
                label="Título"
                value={oppTitle}
                onChange={(e) => setOppTitle(e.target.value)}
              />
              <Input
                label="Monto estimado"
                type="number"
                value={oppAmount}
                onChange={(e) => setOppAmount(e.target.value)}
              />
              <div>
                <label className="label">Etapa</label>
                <select
                  className="input"
                  value={oppStage}
                  onChange={(e) => setOppStage(e.target.value)}
                >
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={!oppTitle}
                loading={oppMut.isPending}
                onClick={() =>
                  oppMut.mutate({
                    title: oppTitle,
                    amount: oppAmount ? parseFloat(oppAmount) : undefined,
                    stage: oppStage,
                  })
                }
              >
                Crear
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {(opportunities || []).map((o: Record<string, unknown>) => (
                <div
                  key={String(o.id)}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{String(o.title)}</p>
                    <p className="text-xs text-slate-500">
                      {String(o.stage)}
                      {o.amount != null
                        ? ` · ${formatCurrency(Number(o.amount))}`
                        : ""}
                    </p>
                  </div>
                  <select
                    className="input py-1 text-xs w-32"
                    value={String(o.stage)}
                    onChange={(e) =>
                      updateOpportunity(String(o.id), {
                        stage: e.target.value,
                      }).then(() =>
                        qc.invalidateQueries({ queryKey: ["opportunities"] })
                      )
                    }
                  >
                    {stages.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Actividades</CardTitle>
            <div className="mt-3 flex gap-2">
              <select
                className="input w-28"
                value={actType}
                onChange={(e) => setActType(e.target.value)}
              >
                <option value="task">Tarea</option>
                <option value="call">Llamada</option>
                <option value="meeting">Reunión</option>
                <option value="email">Email</option>
              </select>
              <input
                className="input flex-1"
                placeholder="Asunto"
                value={actSubject}
                onChange={(e) => setActSubject(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!actSubject}
                loading={actMut.isPending}
                onClick={() =>
                  actMut.mutate({
                    activity_type: actType,
                    subject: actSubject,
                  })
                }
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {(activities || []).map((a: Record<string, unknown>) => (
                <div
                  key={String(a.id)}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="badge bg-slate-100 mr-2">
                      {String(a.activity_type)}
                    </span>
                    {String(a.subject)}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      completeActivity(String(a.id)).then(() =>
                        qc.invalidateQueries({ queryKey: ["activities"] })
                      )
                    }
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* LOTS */}
      {tab === "lots" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle>Registrar lote</CardTitle>
            <div className="mt-3 space-y-2">
              <select
                className="input"
                value={lotProduct}
                onChange={(e) => setLotProduct(e.target.value)}
              >
                <option value="">Producto...</option>
                {(products?.items || []).map((p: Record<string, unknown>) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.name)}
                  </option>
                ))}
              </select>
              <Input
                label="Nº lote"
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
              />
              <Input
                label="Cantidad"
                type="number"
                value={lotQty}
                onChange={(e) => setLotQty(e.target.value)}
              />
              <Input
                label="Vencimiento"
                type="date"
                value={lotExpiry}
                onChange={(e) => setLotExpiry(e.target.value)}
              />
              <Button
                disabled={!lotProduct || !lotNumber}
                loading={lotMut.isPending}
                onClick={() =>
                  lotMut.mutate({
                    product_id: lotProduct,
                    lot_number: lotNumber,
                    quantity: parseFloat(lotQty) || 0,
                    expiry_date: lotExpiry || undefined,
                  })
                }
              >
                Guardar lote
              </Button>
            </div>
            <div className="mt-4 space-y-1 text-sm">
              {(lots || []).map((l: Record<string, unknown>) => (
                <div
                  key={String(l.id)}
                  className="flex justify-between border-b border-slate-100 py-2"
                >
                  <span className="font-mono text-xs">
                    {String(l.lot_number)}
                  </span>
                  <span>
                    qty {Number(l.quantity)}
                    {l.expiry_date
                      ? ` · vence ${formatDate(String(l.expiry_date))}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Números de serie</CardTitle>
            <div className="mt-3 space-y-2">
              <select
                className="input"
                value={serialProduct}
                onChange={(e) => setSerialProduct(e.target.value)}
              >
                <option value="">Producto...</option>
                {(products?.items || []).map((p: Record<string, unknown>) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.name)}
                  </option>
                ))}
              </select>
              <Input
                label="Serie"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
              <Button
                disabled={!serialProduct || !serialNumber}
                loading={serialMut.isPending}
                onClick={() =>
                  serialMut.mutate({
                    product_id: serialProduct,
                    serial_number: serialNumber,
                  })
                }
              >
                Registrar serie
              </Button>
            </div>
            <div className="mt-4 space-y-1 text-sm max-h-64 overflow-y-auto">
              {(serials || []).map((s: Record<string, unknown>) => (
                <div
                  key={String(s.id)}
                  className="flex justify-between border-b border-slate-100 py-2"
                >
                  <span className="font-mono text-xs">
                    {String(s.serial_number)}
                  </span>
                  <span className="badge bg-slate-100">
                    {String(s.status)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* PRODUCTION */}
      {tab === "production" && (
        <div className="mt-6 space-y-4">
          <Card>
            <CardTitle>Nueva lista de materiales (BOM)</CardTitle>
            <CardDescription>
              Producto terminado + un componente (podés ampliar por API)
            </CardDescription>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <select
                className="input"
                value={bomProduct}
                onChange={(e) => setBomProduct(e.target.value)}
              >
                <option value="">Producto terminado...</option>
                {(products?.items || []).map((p: Record<string, unknown>) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.name)}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={bomComponent}
                onChange={(e) => setBomComponent(e.target.value)}
              >
                <option value="">Componente...</option>
                {(products?.items || []).map((p: Record<string, unknown>) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.name)}
                  </option>
                ))}
              </select>
              <Input
                label="Cant. componente"
                type="number"
                value={bomCompQty}
                onChange={(e) => setBomCompQty(e.target.value)}
              />
            </div>
            <Button
              className="mt-3"
              disabled={!bomProduct || !bomComponent}
              loading={bomMut.isPending}
              onClick={() =>
                bomMut.mutate({
                  product_id: bomProduct,
                  name: "Default",
                  quantity: 1,
                  lines: [
                    {
                      component_id: bomComponent,
                      quantity: parseFloat(bomCompQty) || 1,
                    },
                  ],
                })
              }
            >
              Crear BOM
            </Button>
            <ul className="mt-3 text-sm space-y-1">
              {(boms || []).map((b: Record<string, unknown>) => (
                <li key={String(b.id)} className="font-mono text-xs">
                  {String(b.name)} · {String(b.id).slice(0, 8)}… ·{" "}
                  {(b.lines as unknown[])?.length || 0} componentes
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>Orden de producción</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                className="input"
                value={prodBomId}
                onChange={(e) => setProdBomId(e.target.value)}
              >
                <option value="">BOM...</option>
                {(boms || []).map((b: Record<string, unknown>) => (
                  <option key={String(b.id)} value={String(b.id)}>
                    {String(b.name)} ({String(b.id).slice(0, 8)})
                  </option>
                ))}
              </select>
              <Input
                type="number"
                value={prodQty}
                onChange={(e) => setProdQty(e.target.value)}
                className="w-28"
              />
              <Button
                disabled={!prodBomId}
                loading={prodMut.isPending}
                onClick={() =>
                  prodMut.mutate({
                    bom_id: prodBomId,
                    quantity: parseFloat(prodQty) || 1,
                  })
                }
              >
                Crear OP
              </Button>
            </div>
            <div className="mt-4 space-y-2">
              {(production || []).map((p: Record<string, unknown>) => (
                <div
                  key={String(p.id)}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-mono font-semibold">
                      {String(p.order_number)}
                    </span>
                    <span className="ml-2 badge bg-slate-100">
                      {String(p.status)}
                    </span>
                    <span className="ml-2 text-slate-500">
                      qty {Number(p.quantity)}
                    </span>
                  </div>
                  {String(p.status) !== "done" &&
                    String(p.status) !== "cancelled" && (
                      <Button
                        size="sm"
                        loading={completeProd.isPending}
                        onClick={() => completeProd.mutate(String(p.id))}
                      >
                        Completar
                      </Button>
                    )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* COMMISSIONS */}
      {tab === "commissions" && (
        <div className="mt-6 space-y-4">
          <Card>
            <CardTitle>Regla de comisión</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                label="Nombre"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
              />
              <Input
                label="% sobre venta"
                type="number"
                value={ruleRate}
                onChange={(e) => setRuleRate(e.target.value)}
              />
              <div className="flex items-end">
                <Button
                  disabled={!ruleName}
                  loading={ruleMut.isPending}
                  onClick={() =>
                    ruleMut.mutate({
                      name: ruleName,
                      rule_type: "percent_of_sale",
                      rate: parseFloat(ruleRate) || 0,
                    })
                  }
                >
                  Crear regla
                </Button>
              </div>
            </div>
            <ul className="mt-3 text-sm space-y-1">
              {(rules || []).map((r: Record<string, unknown>) => (
                <li key={String(r.id)}>
                  {String(r.name)} — {Number(r.rate)}% ({String(r.rule_type)})
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>Comisiones generadas</CardTitle>
            <CardDescription>
              Calculá desde API: POST /commissions/calculate/{"{invoice_id}"}
            </CardDescription>
            <div className="mt-3 space-y-2 text-sm">
              {(commissionEntries || []).map((e: Record<string, unknown>) => (
                <div
                  key={String(e.id)}
                  className="flex justify-between border-b border-slate-100 py-2"
                >
                  <span>
                    {String(e.period || "—")} · {String(e.status)}
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(Number(e.commission_amount))}
                  </span>
                </div>
              ))}
              {(!commissionEntries || commissionEntries.length === 0) && (
                <p className="text-slate-400">Sin entradas aún</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* CURRENCY */}
      {tab === "currency" && (
        <div className="mt-6 space-y-4">
          <Card>
            <CardTitle>Cargar cotización</CardTitle>
            <div className="mt-3 flex flex-wrap gap-2 items-end">
              <Input
                label="Desde"
                value={fromCcy}
                onChange={(e) => setFromCcy(e.target.value)}
                className="w-24"
              />
              <Input
                label="Hacia"
                value={toCcy}
                onChange={(e) => setToCcy(e.target.value)}
                className="w-24"
              />
              <Input
                label="Tipo de cambio"
                type="number"
                step="any"
                value={rateVal}
                onChange={(e) => setRateVal(e.target.value)}
              />
              <Button
                disabled={!rateVal}
                loading={rateMut.isPending}
                onClick={() =>
                  rateMut.mutate({
                    from_currency: fromCcy,
                    to_currency: toCcy,
                    rate: parseFloat(rateVal),
                  })
                }
              >
                Guardar
              </Button>
            </div>
            <ul className="mt-3 text-sm space-y-1">
              {(rates || []).map((r: Record<string, unknown>) => (
                <li key={String(r.id)}>
                  1 {String(r.from_currency)} = {Number(r.rate)}{" "}
                  {String(r.to_currency)} ({formatDate(String(r.rate_date))})
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>Convertir</CardTitle>
            <div className="mt-3 flex gap-2 items-end">
              <Input
                label="Monto"
                type="number"
                value={convertAmt}
                onChange={(e) => setConvertAmt(e.target.value)}
              />
              <Button
                onClick={async () => {
                  try {
                    const r = await convertCurrency({
                      amount: parseFloat(convertAmt),
                      from_currency: fromCcy,
                      to_currency: toCcy,
                    });
                    setConvertResult(
                      `${r.amount} ${r.to} (tc ${r.rate})`
                    );
                  } catch {
                    setError("No hay cotización para ese par");
                  }
                }}
              >
                Convertir
              </Button>
            </div>
            {convertResult && (
              <p className="mt-3 font-semibold text-brand-700">
                {convertResult}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* WORK ORDERS */}
      {tab === "workorders" && (
        <div className="mt-6 space-y-4">
          <Card>
            <CardTitle>Nueva orden de trabajo</CardTitle>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                label="Título"
                value={woTitle}
                onChange={(e) => setWoTitle(e.target.value)}
              />
              <div>
                <label className="label">Cliente</label>
                <select
                  className="input"
                  value={woPartner}
                  onChange={(e) => setWoPartner(e.target.value)}
                >
                  <option value="">Opcional...</option>
                  {(partners?.items || []).map((p: Record<string, unknown>) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {String(p.name)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              className="mt-3"
              disabled={!woTitle}
              loading={woMut.isPending}
              onClick={() =>
                woMut.mutate({
                  title: woTitle,
                  partner_id: woPartner || undefined,
                })
              }
            >
              Crear OT
            </Button>
          </Card>
          <div className="space-y-2">
            {(workOrders || []).map((w: Record<string, unknown>) => (
              <div
                key={String(w.id)}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div>
                  <span className="font-mono text-sm font-semibold">
                    {String(w.order_number)}
                  </span>
                  <span className="ml-2">{String(w.title)}</span>
                  <span className="ml-2 badge bg-slate-100">
                    {String(w.status)}
                  </span>
                </div>
                {String(w.status) !== "done" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      updateWorkOrder(String(w.id), {
                        status: "done",
                      }).then(() =>
                        qc.invalidateQueries({ queryKey: ["work-orders"] })
                      )
                    }
                  >
                    Cerrar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PAYMENTS */}
      {tab === "payments" && (
        <div className="mt-6 space-y-4">
          <Card>
            <CardTitle>Proveedor de pagos</CardTitle>
            <CardDescription>
              Configuración stub (Mercado Pago / Stripe). No procesa cobros
              reales hasta conectar SDKs.
            </CardDescription>
            <div className="mt-3 space-y-2">
              <select
                className="input"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="mercadopago">Mercado Pago</option>
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
                <option value="other">Otro</option>
              </select>
              <Input
                label="Public key"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
              />
              <Button
                loading={payMut.isPending}
                onClick={() =>
                  payMut.mutate({
                    provider,
                    public_key: publicKey || undefined,
                    is_active: true,
                  })
                }
              >
                Guardar
              </Button>
            </div>
          </Card>
          <div className="space-y-2">
            {(providers || []).map((p: Record<string, unknown>) => (
              <div
                key={String(p.id)}
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm"
              >
                <span className="font-semibold">{String(p.provider)}</span>
                {Boolean(p.is_active) && (
                  <span className="ml-2 badge bg-green-100 text-green-700">
                    activo
                  </span>
                )}
                {Boolean(p.public_key) && (
                  <p className="text-xs text-slate-500 mt-1">
                    key: {String(p.public_key).slice(0, 12)}…
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
