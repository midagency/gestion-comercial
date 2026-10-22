"use client";

import { useMemo, useState, type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageLoader } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getDashboard,
  getSalesByPeriod,
  getPurchasesByPeriod,
  getTopProducts,
  getTopCustomers,
  getInventoryValuation,
  getStockMovementsSummary,
  getAgingReceivable,
  getAgingPayable,
  getCashSessionsReport,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  ShoppingCart,
  Package,
  Users,
  Warehouse,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Landmark,
} from "lucide-react";

type Tab =
  | "overview"
  | "sales"
  | "purchases"
  | "products"
  | "customers"
  | "inventory"
  | "aging"
  | "cash";

function defaultDateFrom(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function Kpi({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: ElementType;
  color?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums truncate">
            {value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={`rounded-lg p-2 shrink-0 ${color || "bg-slate-100 text-slate-600"}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </Card>
  );
}

function BarList({
  items,
  valueKey = "total",
  labelKey = "period",
  color = "bg-brand-500",
}: {
  items: Record<string, unknown>[];
  valueKey?: string;
  labelKey?: string;
  color?: string;
}) {
  const max = Math.max(
    1,
    ...items.map((i) => Number(i[valueKey] || 0))
  );
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">Sin datos</p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={String(item[labelKey])}
          className="flex items-center gap-3 text-sm"
        >
          <span className="w-24 shrink-0 text-slate-500 font-mono text-xs">
            {String(item[labelKey])}
          </span>
          <div className="flex-1 h-6 rounded bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded min-w-[2px] ${color}`}
              style={{
                width: `${(Number(item[valueKey] || 0) / max) * 100}%`,
              }}
            />
          </div>
          <span className="w-28 text-right font-medium shrink-0 tabular-nums">
            {formatCurrency(Number(item[valueKey] || 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [groupBy, setGroupBy] = useState<"day" | "month">("day");
  const [dateFrom, setDateFrom] = useState(defaultDateFrom(30));
  const [dateTo, setDateTo] = useState(todayIso());

  const dateParams = useMemo(
    () => ({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    [dateFrom, dateTo]
  );

  const { data: dash, isLoading: dashLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
  });

  const { data: salesPeriod, isLoading: salesLoading } = useQuery({
    queryKey: ["sales-by-period", groupBy, dateFrom, dateTo],
    queryFn: () => getSalesByPeriod({ group_by: groupBy, ...dateParams }),
    enabled: tab === "sales" || tab === "overview",
  });

  const { data: purchPeriod, isLoading: purchLoading } = useQuery({
    queryKey: ["purchases-by-period", groupBy, dateFrom, dateTo],
    queryFn: () => getPurchasesByPeriod({ group_by: groupBy, ...dateParams }),
    enabled: tab === "purchases" || tab === "overview",
  });

  const { data: topProducts, isLoading: prodLoading } = useQuery({
    queryKey: ["top-products", dateFrom, dateTo],
    queryFn: () => getTopProducts({ limit: 20, ...dateParams }),
    enabled: tab === "products",
  });

  const { data: topCustomers, isLoading: custLoading } = useQuery({
    queryKey: ["top-customers", dateFrom, dateTo],
    queryFn: () => getTopCustomers({ limit: 20, ...dateParams }),
    enabled: tab === "customers",
  });

  const { data: valuation, isLoading: valLoading } = useQuery({
    queryKey: ["inventory-valuation"],
    queryFn: getInventoryValuation,
    enabled: tab === "inventory",
  });

  const { data: movesSummary } = useQuery({
    queryKey: ["moves-summary", dateFrom, dateTo],
    queryFn: () => getStockMovementsSummary(dateParams),
    enabled: tab === "inventory",
  });

  const { data: ar, isLoading: arLoading } = useQuery({
    queryKey: ["aging-ar-reports"],
    queryFn: () => getAgingReceivable(),
    enabled: tab === "aging" || tab === "overview",
  });

  const { data: ap, isLoading: apLoading } = useQuery({
    queryKey: ["aging-ap-reports"],
    queryFn: () => getAgingPayable(),
    enabled: tab === "aging" || tab === "overview",
  });

  const { data: cashSessions, isLoading: cashLoading } = useQuery({
    queryKey: ["cash-sessions-report", dateFrom, dateTo],
    queryFn: () => getCashSessionsReport(dateParams),
    enabled: tab === "cash",
  });

  const tabs: { id: Tab; label: string; icon: ElementType }[] = [
    { id: "overview", label: "Resumen", icon: BarChart3 },
    { id: "sales", label: "Ventas", icon: TrendingUp },
    { id: "purchases", label: "Compras", icon: ShoppingCart },
    { id: "products", label: "Productos", icon: Package },
    { id: "customers", label: "Clientes", icon: Users },
    { id: "inventory", label: "Inventario", icon: Warehouse },
    { id: "aging", label: "CxC / CxP", icon: ArrowDownLeft },
    { id: "cash", label: "Caja", icon: Wallet },
  ];

  const showDateFilter = tab !== "overview" && tab !== "aging";

  const salesItems = salesPeriod?.items || [];
  const purchItems = purchPeriod?.items || [];
  const productItems = topProducts?.items || [];
  const customerItems = topCustomers?.items || [];
  const valuationItems = valuation?.items || [];
  const cashItems = cashSessions?.items || [];
  const moveItems = movesSummary?.items || movesSummary?.by_type || [];

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Analytics del negocio · ventas, compras, stock, cobranzas y caja
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-lg bg-slate-100 p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Date + group filters */}
      {showDateFilter && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
          <div>
            <label className="label">Desde</label>
            <input
              type="date"
              className="input"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input
              type="date"
              className="input"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          {(tab === "sales" || tab === "purchases") && (
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  { id: "day" as const, label: "Por día" },
                  { id: "month" as const, label: "Por mes" },
                ] as const
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupBy(g.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    groupBy === g.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5 sm:ml-auto">
            {[
              { label: "7d", days: 7 },
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
              { label: "Año", days: 365 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setDateFrom(defaultDateFrom(p.days));
                  setDateTo(todayIso());
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== OVERVIEW ===== */}
      {tab === "overview" && (
        <div className="mt-6 space-y-6">
          {dashLoading && <PageLoader />}
          {dash && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  title="Ventas hoy"
                  value={formatCurrency(dash.sales_today)}
                  icon={TrendingUp}
                  color="bg-green-100 text-green-700"
                />
                <Kpi
                  title="Ventas del mes"
                  value={formatCurrency(dash.sales_this_month)}
                  subtitle={`${dash.sales_count_this_month} pedidos`}
                  icon={ShoppingCart}
                  color="bg-blue-100 text-blue-700"
                />
                <Kpi
                  title="Cobros del mes"
                  value={formatCurrency(dash.collections_this_month)}
                  icon={ArrowDownLeft}
                  color="bg-emerald-100 text-emerald-700"
                />
                <Kpi
                  title="Compras del mes"
                  value={formatCurrency(dash.purchases_this_month)}
                  icon={ArrowUpRight}
                  color="bg-orange-100 text-orange-700"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  title="Por cobrar"
                  value={formatCurrency(dash.accounts_receivable)}
                  icon={Wallet}
                  color="bg-purple-100 text-purple-700"
                />
                <Kpi
                  title="Por pagar"
                  value={formatCurrency(dash.accounts_payable)}
                  icon={Landmark}
                  color="bg-rose-100 text-rose-700"
                />
                <Kpi
                  title="Stock bajo"
                  value={String(dash.low_stock_count)}
                  subtitle={`${dash.zero_stock_count} sin stock`}
                  icon={AlertTriangle}
                  color="bg-amber-100 text-amber-700"
                />
                <Kpi
                  title="Caja + Bancos"
                  value={formatCurrency(
                    (dash.cash_in_sessions || 0) + (dash.bank_balance || 0)
                  )}
                  subtitle={`Caja ${formatCurrency(dash.cash_in_sessions)} · Bancos ${formatCurrency(dash.bank_balance)}`}
                  icon={Wallet}
                  color="bg-cyan-100 text-cyan-700"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardTitle>Ventas recientes</CardTitle>
                  <CardDescription>
                    Últimos períodos · {groupBy === "day" ? "por día" : "por mes"}
                  </CardDescription>
                  <div className="mt-4">
                    {salesLoading ? (
                      <PageLoader />
                    ) : (
                      <BarList items={salesItems.slice(-12)} color="bg-brand-500" />
                    )}
                  </div>
                </Card>
                <Card>
                  <CardTitle>Compras recientes</CardTitle>
                  <CardDescription>
                    Últimos períodos · {groupBy === "day" ? "por día" : "por mes"}
                  </CardDescription>
                  <div className="mt-4">
                    {purchLoading ? (
                      <PageLoader />
                    ) : (
                      <BarList
                        items={purchItems.slice(-12)}
                        color="bg-orange-500"
                      />
                    )}
                  </div>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardTitle>Aging CxC (resumen)</CardTitle>
                  <p className="mt-1 text-2xl font-bold text-purple-700 tabular-nums">
                    {formatCurrency(ar?.total_due || 0)}
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {(ar?.buckets || []).map((b: Record<string, unknown>) => (
                      <div
                        key={String(b.label)}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-slate-500">{String(b.label)}</span>
                        <span className="tabular-nums">
                          {Number(b.count)} · {formatCurrency(Number(b.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <CardTitle>Aging CxP (resumen)</CardTitle>
                  <p className="mt-1 text-2xl font-bold text-rose-700 tabular-nums">
                    {formatCurrency(ap?.total_due || 0)}
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {(ap?.buckets || []).map((b: Record<string, unknown>) => (
                      <div
                        key={String(b.label)}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-slate-500">{String(b.label)}</span>
                        <span className="tabular-nums">
                          {Number(b.count)} · {formatCurrency(Number(b.amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== SALES ===== */}
      {tab === "sales" && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi
              title="Total ventas"
              value={formatCurrency(salesPeriod?.grand_total || 0)}
              icon={TrendingUp}
              color="bg-brand-50 text-brand-600"
            />
            <Kpi
              title="Cantidad de pedidos"
              value={String(salesPeriod?.grand_count || 0)}
              icon={ShoppingCart}
              color="bg-blue-50 text-blue-600"
            />
          </div>

          {salesLoading && <PageLoader />}
          {!salesLoading && salesItems.length === 0 && (
            <EmptyState
              icon={TrendingUp}
              title="Sin ventas en el período"
              description="Probá ampliar el rango de fechas."
            />
          )}
          {!salesLoading && salesItems.length > 0 && (
            <>
              <Card>
                <CardTitle>Evolución</CardTitle>
                <div className="mt-4">
                  <BarList items={salesItems} color="bg-brand-500" />
                </div>
              </Card>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Período</th>
                        <th className="px-4 py-3 text-right">Pedidos</th>
                        <th className="px-4 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {salesItems.map((item: Record<string, unknown>) => (
                        <tr
                          key={String(item.period)}
                          className="hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-2 font-mono text-xs">
                            {String(item.period)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {Number(item.orders_count ?? item.count ?? 0)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">
                            {formatCurrency(Number(item.total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== PURCHASES ===== */}
      {tab === "purchases" && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi
              title="Total compras"
              value={formatCurrency(purchPeriod?.grand_total || 0)}
              icon={ShoppingCart}
              color="bg-orange-50 text-orange-600"
            />
            <Kpi
              title="Órdenes"
              value={String(purchPeriod?.grand_count || 0)}
            />
          </div>

          {purchLoading && <PageLoader />}
          {!purchLoading && purchItems.length === 0 && (
            <EmptyState
              icon={ShoppingCart}
              title="Sin compras en el período"
              description="Probá ampliar el rango de fechas."
            />
          )}
          {!purchLoading && purchItems.length > 0 && (
            <>
              <Card>
                <CardTitle>Evolución</CardTitle>
                <div className="mt-4">
                  <BarList items={purchItems} color="bg-orange-500" />
                </div>
              </Card>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left">Período</th>
                        <th className="px-4 py-3 text-right">Órdenes</th>
                        <th className="px-4 py-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {purchItems.map((item: Record<string, unknown>) => (
                        <tr
                          key={String(item.period)}
                          className="hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-2 font-mono text-xs">
                            {String(item.period)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {Number(item.orders_count ?? item.count ?? 0)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">
                            {formatCurrency(Number(item.total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== PRODUCTS ===== */}
      {tab === "products" && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi
              title="Ingresos (top)"
              value={formatCurrency(topProducts?.total_revenue || 0)}
              icon={Package}
              color="bg-brand-50 text-brand-600"
            />
            <Kpi
              title="Productos en ranking"
              value={String(productItems.length)}
            />
          </div>

          {prodLoading && <PageLoader />}
          {!prodLoading && productItems.length === 0 && (
            <EmptyState
              icon={Package}
              title="Sin datos de productos"
              description="No hay ventas de productos en el período seleccionado."
            />
          )}
          {!prodLoading && productItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Producto</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">
                        SKU
                      </th>
                      <th className="px-4 py-3 text-right">Cant.</th>
                      <th className="px-4 py-3 text-right">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productItems.map(
                      (item: Record<string, unknown>, idx: number) => (
                        <tr
                          key={String(item.product_id)}
                          className="hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-2 font-medium">
                            {String(item.product_name)}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-500 hidden sm:table-cell">
                            {String(item.sku || "—")}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {Number(item.quantity_sold)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">
                            {formatCurrency(Number(item.revenue))}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== CUSTOMERS ===== */}
      {tab === "customers" && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi
              title="Facturación (top)"
              value={formatCurrency(topCustomers?.total_revenue || 0)}
              icon={Users}
              color="bg-purple-50 text-purple-600"
            />
            <Kpi
              title="Clientes en ranking"
              value={String(customerItems.length)}
            />
          </div>

          {custLoading && <PageLoader />}
          {!custLoading && customerItems.length === 0 && (
            <EmptyState
              icon={Users}
              title="Sin datos de clientes"
              description="No hay ventas a clientes en el período seleccionado."
            />
          )}
          {!custLoading && customerItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">#</th>
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-right">Pedidos</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerItems.map(
                      (item: Record<string, unknown>, idx: number) => (
                        <tr
                          key={String(item.partner_id || item.customer_id)}
                          className="hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-2 font-medium">
                            {String(
                              item.partner_name ||
                                item.customer_name ||
                                item.name ||
                                "—"
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {Number(item.orders_count ?? item.count ?? 0)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">
                            {formatCurrency(
                              Number(item.revenue ?? item.total ?? 0)
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== INVENTORY ===== */}
      {tab === "inventory" && (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi
              title="Valuación total"
              value={formatCurrency(valuation?.total_valuation || 0)}
              icon={Warehouse}
              color="bg-slate-100 text-slate-600"
            />
            <Kpi
              title="Líneas de stock"
              value={String(valuationItems.length)}
            />
          </div>

          {Array.isArray(moveItems) && moveItems.length > 0 && (
            <Card>
              <CardTitle>Movimientos por tipo</CardTitle>
              <div className="mt-3 flex flex-wrap gap-2">
                {moveItems.map((m: Record<string, unknown>) => (
                  <Badge key={String(m.move_type || m.type)} variant="default">
                    {String(m.move_type || m.type)}:{" "}
                    {Number(m.count ?? m.quantity ?? 0)}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {valLoading && <PageLoader />}
          {!valLoading && valuationItems.length === 0 && (
            <EmptyState
              icon={Warehouse}
              title="Sin valuación de stock"
              description="Hace falta stock con costo cargado en productos/variantes."
            />
          )}
          {!valLoading && valuationItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Producto</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">
                        SKU
                      </th>
                      <th className="px-4 py-3 text-left">Almacén</th>
                      <th className="px-4 py-3 text-right">Cant.</th>
                      <th className="px-4 py-3 text-right hidden md:table-cell">
                        Costo
                      </th>
                      <th className="px-4 py-3 text-right">Valuación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {valuationItems.map(
                      (item: Record<string, unknown>, idx: number) => (
                        <tr
                          key={`${item.product_id}-${item.warehouse_id}-${idx}`}
                          className="hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-2 font-medium">
                            {String(item.product_name)}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-500 hidden sm:table-cell">
                            {String(item.sku || "—")}
                          </td>
                          <td className="px-4 py-2 text-slate-600">
                            {String(item.warehouse_name)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {Number(item.quantity)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums hidden md:table-cell">
                            {formatCurrency(Number(item.unit_cost))}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">
                            {formatCurrency(Number(item.valuation))}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== AGING ===== */}
      {tab === "aging" && (
        <div className="mt-6 space-y-6">
          {(arLoading || apLoading) && <PageLoader />}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardTitle>Cuentas por cobrar</CardTitle>
              <p className="mt-1 text-2xl font-bold text-purple-700 tabular-nums">
                {formatCurrency(ar?.total_due || 0)}
              </p>
              <div className="mt-4 space-y-2">
                {(ar?.buckets || []).map((b: Record<string, unknown>) => (
                  <div
                    key={String(b.label)}
                    className="flex justify-between text-sm border-b border-slate-50 pb-2"
                  >
                    <span className="text-slate-500">{String(b.label)}</span>
                    <span className="tabular-nums font-medium">
                      {Number(b.count)} · {formatCurrency(Number(b.amount))}
                    </span>
                  </div>
                ))}
                {(!ar?.buckets || ar.buckets.length === 0) && (
                  <p className="text-sm text-slate-400 py-4 text-center">
                    Sin saldos pendientes
                  </p>
                )}
              </div>
            </Card>
            <Card>
              <CardTitle>Cuentas por pagar</CardTitle>
              <p className="mt-1 text-2xl font-bold text-rose-700 tabular-nums">
                {formatCurrency(ap?.total_due || 0)}
              </p>
              <div className="mt-4 space-y-2">
                {(ap?.buckets || []).map((b: Record<string, unknown>) => (
                  <div
                    key={String(b.label)}
                    className="flex justify-between text-sm border-b border-slate-50 pb-2"
                  >
                    <span className="text-slate-500">{String(b.label)}</span>
                    <span className="tabular-nums font-medium">
                      {Number(b.count)} · {formatCurrency(Number(b.amount))}
                    </span>
                  </div>
                ))}
                {(!ap?.buckets || ap.buckets.length === 0) && (
                  <p className="text-sm text-slate-400 py-4 text-center">
                    Sin saldos pendientes
                  </p>
                )}
              </div>
            </Card>
          </div>
          <p className="text-sm text-slate-500">
            Detalle completo de aging en{" "}
            <a href="/accounting" className="text-brand-600 hover:underline">
              Contabilidad
            </a>
            .
          </p>
        </div>
      )}

      {/* ===== CASH ===== */}
      {tab === "cash" && (
        <div className="mt-6 space-y-4">
          <Kpi
            title="Diferencia total de arqueos"
            value={formatCurrency(cashSessions?.total_difference || 0)}
            subtitle={
              (cashSessions?.total_difference || 0) === 0
                ? "Sin diferencias"
                : "Revisá sesiones con desvío"
            }
            icon={Wallet}
            color={
              (cashSessions?.total_difference || 0) === 0
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }
          />

          {cashLoading && <PageLoader />}
          {!cashLoading && cashItems.length === 0 && (
            <EmptyState
              icon={Wallet}
              title="Sin sesiones de caja en el período"
              description="Las sesiones cerradas aparecerán aquí con su arqueo."
            />
          )}
          {!cashLoading && cashItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Caja</th>
                      <th className="px-4 py-3 text-left">Apertura</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">
                        Cierre
                      </th>
                      <th className="px-4 py-3 text-right">Esperado</th>
                      <th className="px-4 py-3 text-right">Contado</th>
                      <th className="px-4 py-3 text-right">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cashItems.map((s: Record<string, unknown>) => {
                      const diff = Number(s.difference ?? 0);
                      return (
                        <tr key={String(s.id)} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2 font-medium">
                            {String(s.register_name || s.register_id || "—")}
                          </td>
                          <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                            {s.opened_at
                              ? formatDate(String(s.opened_at))
                              : "—"}
                          </td>
                          <td className="px-4 py-2 text-slate-600 whitespace-nowrap hidden sm:table-cell">
                            {s.closed_at
                              ? formatDate(String(s.closed_at))
                              : "—"}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatCurrency(Number(s.expected_amount ?? 0))}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatCurrency(Number(s.closing_amount ?? 0))}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <Badge
                              variant={
                                diff === 0
                                  ? "success"
                                  : Math.abs(diff) < 100
                                  ? "warning"
                                  : "danger"
                              }
                            >
                              {formatCurrency(diff)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
