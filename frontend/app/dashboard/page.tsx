"use client";

import type { ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { PageLoader } from "@/components/ui/Spinner";
import { getDashboard } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
  Wallet,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: ElementType;
  color: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
        <div className={`rounded-lg p-2.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
  });

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Resumen de tu negocio en tiempo real</p>
      </div>

      {isLoading && <PageLoader />}

      {error && (
        <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          No se pudo cargar el dashboard. Verificá que el backend esté corriendo en{" "}
          <code className="font-mono">localhost:8000</code>.
        </div>
      )}

      {data && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Ventas hoy"
              value={formatCurrency(data.sales_today)}
              icon={TrendingUp}
              color="bg-green-100 text-green-700"
            />
            <KpiCard
              title="Ventas del mes"
              value={formatCurrency(data.sales_this_month)}
              subtitle={`${data.sales_count_this_month} pedidos`}
              icon={ShoppingCart}
              color="bg-blue-100 text-blue-700"
            />
            <KpiCard
              title="Cobros del mes"
              value={formatCurrency(data.collections_this_month)}
              icon={ArrowDownLeft}
              color="bg-emerald-100 text-emerald-700"
            />
            <KpiCard
              title="Compras del mes"
              value={formatCurrency(data.purchases_this_month)}
              icon={ArrowUpRight}
              color="bg-orange-100 text-orange-700"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Cuentas por cobrar"
              value={formatCurrency(data.accounts_receivable)}
              icon={Wallet}
              color="bg-purple-100 text-purple-700"
            />
            <KpiCard
              title="Cuentas por pagar"
              value={formatCurrency(data.accounts_payable)}
              icon={Landmark}
              color="bg-rose-100 text-rose-700"
            />
            <KpiCard
              title="Stock bajo"
              value={String(data.low_stock_count)}
              subtitle={`${data.zero_stock_count} sin stock`}
              icon={AlertTriangle}
              color="bg-amber-100 text-amber-700"
            />
            <KpiCard
              title="Efectivo en caja"
              value={formatCurrency(data.cash_in_sessions)}
              subtitle={`${data.open_cash_sessions} sesión(es) abierta(s)`}
              icon={Package}
              color="bg-cyan-100 text-cyan-700"
            />
          </div>

          <Card>
            <CardTitle>Bancos</CardTitle>
            <CardDescription>
              Saldo total en cuentas bancarias:{" "}
              <strong className="text-slate-900">{formatCurrency(data.bank_balance)}</strong>
            </CardDescription>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
