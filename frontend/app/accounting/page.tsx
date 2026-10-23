"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import {
  getDashboard,
  getAgingReceivable,
  getAgingPayable,
  listAccounts,
  seedChartOfAccounts,
  listJournalEntries,
  createJournalEntry,
  getTrialBalance,
  listChecks,
  createCheck,
  updateCheckStatus,
  listInvoices,
  authorizeInvoice,
  listNotifications,
  markNotificationRead,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import {
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Scale,
  Plus,
  Download,
  Bell,
} from "lucide-react";

type Tab =
  | "overview"
  | "chart"
  | "entries"
  | "trial";

export default function AccountingPage() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Journal form
  const [entryDesc, setEntryDesc] = useState("");
  const [lines, setLines] = useState([
    { account_id: "", debit: "", credit: "" },
    { account_id: "", debit: "", credit: "" },
  ]);

  // Check form
  const [showCheck, setShowCheck] = useState(false);
  const [checkForm, setCheckForm] = useState({
    check_kind: "third_party",
    bank_name: "",
    check_number: "",
    amount: "",
    due_date: "",
  });

  const { data: dash } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
  });
  const { data: ar } = useQuery({
    queryKey: ["aging-ar"],
    queryFn: () => getAgingReceivable(),
    enabled: tab === "overview",
  });
  const { data: ap } = useQuery({
    queryKey: ["aging-ap"],
    queryFn: () => getAgingPayable(),
    enabled: tab === "overview",
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
    enabled: ["chart", "entries", "trial"].includes(tab),
  });
  const { data: entries } = useQuery({
    queryKey: ["journal-entries"],
    queryFn: () => listJournalEntries({ page_size: 30 }),
    enabled: tab === "entries",
  });
  const { data: trial } = useQuery({
    queryKey: ["trial-balance"],
    queryFn: getTrialBalance,
    enabled: tab === "trial",
  });
  const { data: checks } = useQuery({
    queryKey: ["checks"],
    queryFn: () => listChecks(),
    enabled: false,
  });
  const { data: invoices } = useQuery({
    queryKey: ["invoices-fiscal"],
    queryFn: () => listInvoices({ page_size: 50 }),
    enabled: false,
  });
  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(false),
    enabled: false,
  });

  const seedMut = useMutation({
    mutationFn: seedChartOfAccounts,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setMsg("Plan de cuentas cargado");
    },
  });

  const entryMut = useMutation({
    mutationFn: createJournalEntry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      qc.invalidateQueries({ queryKey: ["trial-balance"] });
      setEntryDesc("");
      setLines([
        { account_id: "", debit: "", credit: "" },
        { account_id: "", debit: "", credit: "" },
      ]);
      setMsg("Asiento registrado");
      setError("");
    },
    onError: (e: unknown) => {
      setError(
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error en asiento"
      );
    },
  });

  const checkMut = useMutation({
    mutationFn: createCheck,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checks"] });
      setShowCheck(false);
      setCheckForm({
        check_kind: "third_party",
        bank_name: "",
        check_number: "",
        amount: "",
        due_date: "",
      });
    },
  });

  const checkStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateCheckStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checks"] }),
  });

  const authMut = useMutation({
    mutationFn: (id: string) =>
      authorizeInvoice(id, {
        simulate: true,
        point_of_sale: "1",
        voucher_type: "6",
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invoices-fiscal"] });
      setMsg(`CAE simulado: ${data.cae}`);
    },
    onError: (e: unknown) => {
      setError(
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al autorizar"
      );
    },
  });

  async function downloadCsv(resource: "partners" | "products" | "invoices") {
    try {
      const base =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
      const res = await fetch(`${base}/export/${resource}.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Error al exportar");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${resource}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo exportar");
    }
  }

  const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Resumen" },
  { id: "chart", label: "Plan de cuentas" },
  { id: "entries", label: "Asientos" },
  { id: "trial", label: "Sumas y saldos" },
];

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Contabilidad</h1>
        <p className="mt-1 text-sm text-slate-500">
          Plan de cuentas, asientos y saldos
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

      {tab === "overview" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-sm text-slate-500">Ventas del mes</p>
            <p className="text-2xl font-bold">
              {formatCurrency(dash?.sales_this_month || 0)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">CxC</p>
            <p className="text-2xl font-bold text-purple-700">
              {formatCurrency(dash?.accounts_receivable || ar?.total_due || 0)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">CxP</p>
            <p className="text-2xl font-bold text-rose-700">
              {formatCurrency(dash?.accounts_payable || ap?.total_due || 0)}
            </p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Bancos</p>
            <p className="text-2xl font-bold">
              {formatCurrency(dash?.bank_balance || 0)}
            </p>
          </Card>
        </div>
      )}

      {tab === "chart" && (
        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Button
              loading={seedMut.isPending}
              onClick={() => seedMut.mutate()}
            >
              Cargar plan por defecto
            </Button>
          </div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Código</th>
                  <th className="px-4 py-2 text-left">Nombre</th>
                  <th className="px-4 py-2 text-left">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(accounts || []).map((a: Record<string, unknown>) => (
                  <tr key={String(a.id)}>
                    <td className="px-4 py-2 font-mono text-xs">
                      {String(a.code)}
                    </td>
                    <td className="px-4 py-2">{String(a.name)}</td>
                    <td className="px-4 py-2">
                      <span className="badge bg-slate-100 text-slate-700">
                        {String(a.account_type)}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!accounts || accounts.length === 0) && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-8 text-center text-slate-400"
                    >
                      Sin cuentas. Cargá el plan por defecto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === "entries" && (
        <div className="mt-6 space-y-4">
          <Card>
            <CardTitle>Nuevo asiento</CardTitle>
            <CardDescription>
              Debe = Haber. Mínimo 2 líneas.
            </CardDescription>
            <Input
              className="mt-3"
              label="Descripción"
              value={entryDesc}
              onChange={(e) => setEntryDesc(e.target.value)}
            />
            {lines.map((ln, idx) => (
              <div
                key={idx}
                className="mt-3 grid gap-2 sm:grid-cols-3"
              >
                <div>
                  <label className="label">Cuenta</label>
                  <select
                    className="input"
                    value={ln.account_id}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx] = { ...ln, account_id: e.target.value };
                      setLines(next);
                    }}
                  >
                    <option value="">...</option>
                    {(accounts || []).map((a: Record<string, unknown>) => (
                      <option key={String(a.id)} value={String(a.id)}>
                        {String(a.code)} — {String(a.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Debe"
                  type="number"
                  min={0}
                  value={ln.debit}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...ln, debit: e.target.value, credit: "" };
                    setLines(next);
                  }}
                />
                <Input
                  label="Haber"
                  type="number"
                  min={0}
                  value={ln.credit}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx] = { ...ln, credit: e.target.value, debit: "" };
                    setLines(next);
                  }}
                />
              </div>
            ))}
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setLines([
                    ...lines,
                    { account_id: "", debit: "", credit: "" },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Línea
              </Button>
              <Button
                loading={entryMut.isPending}
                onClick={() =>
                  entryMut.mutate({
                    description: entryDesc || undefined,
                    lines: lines
                      .filter((l) => l.account_id)
                      .map((l) => ({
                        account_id: l.account_id,
                        debit: parseFloat(l.debit) || 0,
                        credit: parseFloat(l.credit) || 0,
                      })),
                  })
                }
              >
                Registrar asiento
              </Button>
            </div>
          </Card>

          <div className="space-y-2">
            {(entries?.items || []).map((e: Record<string, unknown>) => (
              <div
                key={String(e.id)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex justify-between">
                  <span className="font-mono text-sm font-semibold">
                    {String(e.entry_number)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatDate(String(e.entry_date))}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {String(e.description || "—")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "trial" && (
        <div className="mt-6">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Código</th>
                  <th className="px-4 py-2 text-left">Cuenta</th>
                  <th className="px-4 py-2 text-right">Debe</th>
                  <th className="px-4 py-2 text-right">Haber</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(trial || []).map((r: Record<string, unknown>) => (
                  <tr key={String(r.account_id)}>
                    <td className="px-4 py-2 font-mono text-xs">
                      {String(r.code)}
                    </td>
                    <td className="px-4 py-2">{String(r.name)}</td>
                    <td className="px-4 py-2 text-right">
                      {formatCurrency(Number(r.debit))}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatCurrency(Number(r.credit))}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatCurrency(Number(r.balance))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* {tab === "checks" removed */}
{/* {tab === "einvoice" removed */}
{/* {tab === "export" removed */}
{/* {tab === "notifications" removed */}
</AppShell>
  );
}
