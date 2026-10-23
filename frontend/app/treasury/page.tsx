"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageLoader } from "@/components/ui/Spinner";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { BadgeVariant } from "@/components/ui/Badge";
import {
  getTreasurySummary,
  listRegisters,
  createRegister,
  openCashSession,
  closeCashSession,
  getCashSession,
  listCashSessions,
  addCashMovement,
  listBankAccounts,
  createBankAccount,
  listBankTransactions,
  createBankTransaction,
  listChecks,
  updateCheckStatus,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Wallet,
  Landmark,
  Plus,
  Lock,
  Unlock,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type TabId = "registers" | "sessions" | "banks" | "checks";

export default function TreasuryPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState<TabId>("registers");
  const [sessionStatusFilter, setSessionStatusFilter] = useState("");

  // Register form
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [regName, setRegName] = useState("");
  const [regCode, setRegCode] = useState("");

  // Open session
  const [openRegisterId, setOpenRegisterId] = useState<string | null>(null);
  const [openingAmount, setOpeningAmount] = useState("0");

  // Close session
  const [closeSessionId, setCloseSessionId] = useState<string | null>(null);
  const [closingAmount, setClosingAmount] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  // Session detail
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<Record<string, unknown> | null>(null);

  // Movement
  const [showMovement, setShowMovement] = useState(false);
  const [movSessionId, setMovSessionId] = useState("");
  const [movDirection, setMovDirection] = useState("income");
  const [movAmount, setMovAmount] = useState("");
  const [movType, setMovType] = useState("adjustment");
  const [movDesc, setMovDesc] = useState("");

  // Bank account
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankBankName, setBankBankName] = useState("");
  const [bankNumber, setBankNumber] = useState("");
  const [bankBalance, setBankBalance] = useState("0");
  const [bankCurrency, setBankCurrency] = useState("ARS");

  // Bank transaction
  const [showTxForm, setShowTxForm] = useState(false);
  const [txAccountId, setTxAccountId] = useState("");
  const [txType, setTxType] = useState("deposit");
  const [txAmount, setTxAmount] = useState("");
  const [txReference, setTxReference] = useState("");
  const [txDescription, setTxDescription] = useState("");

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["treasury-summary"],
    queryFn: getTreasurySummary,
  });

  const { data: registers, isLoading: regLoading } = useQuery({
    queryKey: ["registers"],
    queryFn: listRegisters,
  });

  const { data: sessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["cash-sessions", sessionStatusFilter],
    queryFn: () =>
      listCashSessions({
        page_size: 50,
        status: sessionStatusFilter || undefined,
      }),
    enabled: tab === "sessions" || tab === "registers",
  });

  const { data: bankAccounts, isLoading: banksLoading } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => listBankAccounts(),
    enabled: tab === "banks",
  });

  const { data: bankTx, isLoading: txLoading } = useQuery({
    queryKey: ["bank-transactions"],
    queryFn: () => listBankTransactions({ page_size: 50 }),
    enabled: tab === "banks",
  });

  const registerMap = useMemo(() => {
    const map: Record<string, string> = {};
    (registers || []).forEach((r: Record<string, unknown>) => {
      map[String(r.id)] = String(r.name);
    });
    return map;
  }, [registers]);

  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    (bankAccounts || []).forEach((a: Record<string, unknown>) => {
      map[String(a.id)] = String(a.name);
    });
    return map;
  }, [bankAccounts]);

  const createRegMut = useMutation({
    mutationFn: createRegister,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registers"] });
      qc.invalidateQueries({ queryKey: ["treasury-summary"] });
      success("Caja creada");
      setShowRegisterForm(false);
      setRegName("");
      setRegCode("");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al crear caja";
      toastError("Error", String(msg));
    },
  });

  const openMut = useMutation({
    mutationFn: openCashSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["registers"] });
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      qc.invalidateQueries({ queryKey: ["treasury-summary"] });
      success("Sesión abierta");
      setOpenRegisterId(null);
      setOpeningAmount("0");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al abrir sesión";
      toastError("Error", String(msg));
    },
  });

  const closeMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      closeCashSession(id, payload),
    onSuccess: (data: Record<string, unknown>) => {
      qc.invalidateQueries({ queryKey: ["registers"] });
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      qc.invalidateQueries({ queryKey: ["treasury-summary"] });
      const diff = Number(data.difference ?? 0);
      if (diff !== 0) {
        success(
          "Sesión cerrada",
          `Diferencia de arqueo: ${formatCurrency(diff)}`
        );
      } else {
        success("Sesión cerrada sin diferencias");
      }
      setCloseSessionId(null);
      setClosingAmount("");
      setCloseNotes("");
      if (expandedSessionId === String(data.id)) {
        setSessionDetail(data);
      }
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al cerrar sesión";
      toastError("Error", String(msg));
    },
  });

  const movMut = useMutation({
    mutationFn: addCashMovement,
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      qc.invalidateQueries({ queryKey: ["treasury-summary"] });
      success("Movimiento registrado");
      if (expandedSessionId) {
        try {
          const d = await getCashSession(expandedSessionId);
          setSessionDetail(d);
        } catch {
          /* ignore */
        }
      }
      setShowMovement(false);
      setMovAmount("");
      setMovDesc("");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al registrar movimiento";
      toastError("Error", String(msg));
    },
  });

  const bankMut = useMutation({
    mutationFn: createBankAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["treasury-summary"] });
      success("Cuenta bancaria creada");
      setShowBankForm(false);
      setBankName("");
      setBankBankName("");
      setBankNumber("");
      setBankBalance("0");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al crear cuenta";
      toastError("Error", String(msg));
    },
  });

  const txMut = useMutation({
    mutationFn: createBankTransaction,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["bank-transactions"] });
      qc.invalidateQueries({ queryKey: ["treasury-summary"] });
      success("Movimiento bancario registrado");
      setShowTxForm(false);
      setTxAmount("");
      setTxReference("");
      setTxDescription("");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al registrar movimiento";
      toastError("Error", String(msg));
    },
  });

  async function toggleSession(id: string) {
    if (expandedSessionId === id) {
      setExpandedSessionId(null);
      setSessionDetail(null);
      return;
    }
    setExpandedSessionId(id);
    try {
      const d = await getCashSession(id);
      setSessionDetail(d);
    } catch {
      toastError("No se pudo cargar el detalle de la sesión");
      setExpandedSessionId(null);
    }
  }

  function openCloseModal(sessionId: string, expected?: number) {
    setCloseSessionId(sessionId);
    setClosingAmount(expected != null ? String(expected) : "");
    setCloseNotes("");
  }

  const sessionItems = sessions?.items || [];
  const bankList = bankAccounts || [];
  const txItems = bankTx?.items || bankTx || [];

  const movementTypeLabel: Record<string, string> = {
    deposit: "Depósito",
    withdrawal: "Retiro",
    adjustment: "Ajuste",
    transfer: "Transferencia",
    other: "Otro",
    sale: "Venta",
  };

  const txTypeLabel: Record<string, string> = {
    deposit: "Depósito",
    withdrawal: "Extracción",
    transfer_in: "Transferencia entrante",
    transfer_out: "Transferencia saliente",
    fee: "Comisión",
    adjustment: "Ajuste",
  };


  const { data: checks, isLoading: checksLoading } = useQuery({
    queryKey: ["checks"],
    queryFn: () => listChecks(),
    enabled: tab === "checks",
  });

  const checkStatusMut = useMutation({
    mutationFn: ({ id, status, bank_account_id }: { id: string; status: string; bank_account_id?: string }) =>
      updateCheckStatus(id, status, bank_account_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checks"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      success("Cheque actualizado");
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Error";
      toastError("Error", String(msg));
    },
  });

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Caja y Tesorería</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sesiones de caja, movimientos y cuentas bancarias
          </p>
        </div>
        {tab === "registers" && (
          <Button onClick={() => setShowRegisterForm(true)}>
            <Plus className="h-4 w-4" /> Nueva caja
          </Button>
        )}
        {tab === "banks" && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowTxForm(true)}>
              <Plus className="h-4 w-4" /> Movimiento
            </Button>
            <Button onClick={() => setShowBankForm(true)}>
              <Plus className="h-4 w-4" /> Nueva cuenta
            </Button>
          </div>
        )}
      </div>

      {/* KPIs */}
      {summaryLoading && <PageLoader />}
      {summary && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Efectivo en sesiones</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">
                  {formatCurrency(summary.total_cash_in_open_sessions ?? 0)}
                </p>
                <p className="text-xs text-slate-400">
                  {summary.open_sessions ?? 0} sesión(es) abierta(s)
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Saldo bancario</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">
                  {formatCurrency(summary.total_bank_balance ?? 0)}
                </p>
                <p className="text-xs text-slate-400">
                  {summary.bank_accounts_count ?? 0} cuenta(s)
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
                <History className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Cajas registradas</p>
                <p className="text-xl font-bold text-slate-900">
                  {summary.registers_count ?? 0}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-lg bg-slate-100 p-1 w-full sm:w-fit overflow-x-auto">
        {(
          [
            { id: "registers" as const, label: "Cajas" },
            { id: "sessions" as const, label: "Sesiones" },
            { id: "banks" as const, label: "Bancos" },
            { id: "checks" as const, label: "Cheques" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== REGISTERS ===== */}
      {tab === "registers" && (
        <div className="mt-6">
          {regLoading && <PageLoader />}
          {!regLoading && (!registers || registers.length === 0) && (
            <EmptyState
              icon={Wallet}
              title="No hay cajas"
              description="Creá una caja registradora para abrir sesiones y usar el POS."
              actionLabel="Nueva caja"
              onAction={() => setShowRegisterForm(true)}
            />
          )}
          <div className="space-y-2">
            {(registers || []).map((r: Record<string, unknown>) => {
              const open = Boolean(r.open_session_id);
              return (
                <div
                  key={String(r.id)}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">
                        {String(r.name)}
                      </p>
                      {r.code ? (
                        <span className="text-xs font-mono text-slate-400">
                          {String(r.code)}
                        </span>
                      ) : null}
                      <Badge variant={open ? "success" : "default"}>
                        {open ? "Sesión abierta" : "Cerrada"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {open ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setMovSessionId(String(r.open_session_id));
                            setShowMovement(true);
                          }}
                        >
                          Movimiento
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            openCloseModal(String(r.open_session_id))
                          }
                        >
                          <Lock className="h-3.5 w-3.5" /> Cerrar sesión
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => {
                          setOpenRegisterId(String(r.id));
                          setOpeningAmount("0");
                        }}
                      >
                        <Unlock className="h-3.5 w-3.5" /> Abrir sesión
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== SESSIONS ===== */}
      {tab === "sessions" && (
        <div className="mt-6">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { value: "", label: "Todas" },
              { value: "open", label: "Abiertas" },
              { value: "closed", label: "Cerradas" },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setSessionStatusFilter(f.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  sessionStatusFilter === f.value
                    ? "bg-brand-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {sessionsLoading && <PageLoader />}
          {!sessionsLoading && sessionItems.length === 0 && (
            <EmptyState
              icon={History}
              title="Sin sesiones"
              description="Las sesiones se crean al abrir una caja."
            />
          )}

          <div className="space-y-2">
            {sessionItems.map((s: Record<string, unknown>) => {
              const id = String(s.id);
              const isOpen = expandedSessionId === id;
              const st = String(s.status);
              const meta: { label: string; variant: BadgeVariant } =
                st === "open"
                  ? { label: "Abierta", variant: "success" }
                  : { label: "Cerrada", variant: "default" };

              return (
                <div
                  key={id}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => toggleSession(id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">
                          {registerMap[String(s.register_id)] || "Caja"}
                        </span>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Apertura: {formatDate(String(s.opened_at))}
                        {s.closed_at
                          ? ` · Cierre: ${formatDate(String(s.closed_at))}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(Number(s.opening_amount ?? 0))}
                      </p>
                      <p className="text-xs text-slate-400">apertura</p>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    )}
                  </button>

                  {isOpen && sessionDetail && String(sessionDetail.id) === id && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-4 text-sm">
                        <div>
                          <p className="text-xs text-slate-500">Apertura</p>
                          <p className="font-semibold tabular-nums">
                            {formatCurrency(Number(sessionDetail.opening_amount))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Ingresos</p>
                          <p className="font-semibold text-green-700 tabular-nums">
                            {formatCurrency(Number(sessionDetail.total_income ?? 0))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Egresos</p>
                          <p className="font-semibold text-red-600 tabular-nums">
                            {formatCurrency(Number(sessionDetail.total_expense ?? 0))}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Esperado</p>
                          <p className="font-semibold tabular-nums">
                            {formatCurrency(
                              Number(
                                sessionDetail.expected_amount ??
                                  Number(sessionDetail.opening_amount) +
                                    Number(sessionDetail.total_income ?? 0) -
                                    Number(sessionDetail.total_expense ?? 0)
                              )
                            )}
                          </p>
                        </div>
                        {sessionDetail.closing_amount != null && (
                          <>
                            <div>
                              <p className="text-xs text-slate-500">Cierre contado</p>
                              <p className="font-semibold tabular-nums">
                                {formatCurrency(Number(sessionDetail.closing_amount))}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Diferencia</p>
                              <p
                                className={`font-semibold tabular-nums ${
                                  Number(sessionDetail.difference) === 0
                                    ? "text-green-700"
                                    : "text-amber-700"
                                }`}
                              >
                                {formatCurrency(Number(sessionDetail.difference ?? 0))}
                              </p>
                            </div>
                          </>
                        )}
                      </div>

                      {st === "open" && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setMovSessionId(id);
                              setShowMovement(true);
                            }}
                          >
                            Movimiento manual
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              openCloseModal(
                                id,
                                Number(
                                  sessionDetail.expected_amount ??
                                    Number(sessionDetail.opening_amount) +
                                      Number(sessionDetail.total_income ?? 0) -
                                      Number(sessionDetail.total_expense ?? 0)
                                )
                              )
                            }
                          >
                            <Lock className="h-3.5 w-3.5" /> Cerrar sesión
                          </Button>
                        </div>
                      )}

                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-left">Fecha</th>
                              <th className="px-3 py-2 text-left">Tipo</th>
                              <th className="px-3 py-2 text-left">Dir.</th>
                              <th className="px-3 py-2 text-right">Monto</th>
                              <th className="px-3 py-2 text-left hidden sm:table-cell">
                                Desc.
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {((sessionDetail.movements as Record<string, unknown>[]) ||
                              []).length === 0 && (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="px-3 py-6 text-center text-slate-400"
                                >
                                  Sin movimientos
                                </td>
                              </tr>
                            )}
                            {((sessionDetail.movements as Record<string, unknown>[]) ||
                              []).map((m) => (
                              <tr key={String(m.id)}>
                                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                  {m.created_at
                                    ? formatDate(String(m.created_at))
                                    : "—"}
                                </td>
                                <td className="px-3 py-2">
                                  {movementTypeLabel[String(m.movement_type)] ||
                                    String(m.movement_type)}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge
                                    variant={
                                      m.direction === "income"
                                        ? "success"
                                        : "danger"
                                    }
                                  >
                                    {m.direction === "income" ? (
                                      <span className="inline-flex items-center gap-0.5">
                                        <ArrowDownLeft className="h-3 w-3" /> Ingreso
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-0.5">
                                        <ArrowUpRight className="h-3 w-3" /> Egreso
                                      </span>
                                    )}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 text-right font-medium tabular-nums">
                                  {formatCurrency(Number(m.amount))}
                                </td>
                                <td className="px-3 py-2 text-slate-500 hidden sm:table-cell max-w-[180px] truncate">
                                  {String(m.description || "—")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== BANKS ===== */}
      {tab === "banks" && (
        <div className="mt-6 space-y-6">
          {banksLoading && <PageLoader />}
          {!banksLoading && bankList.length === 0 && (
            <EmptyState
              icon={Landmark}
              title="Sin cuentas bancarias"
              description="Registrá una cuenta para llevar saldos y movimientos."
              actionLabel="Nueva cuenta"
              onAction={() => setShowBankForm(true)}
            />
          )}

          {bankList.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {bankList.map((a: Record<string, unknown>) => (
                <Card key={String(a.id)} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {String(a.name)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {a.bank_name ? String(a.bank_name) : "—"}
                        {a.account_number
                          ? ` · ${String(a.account_number)}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant="info">{String(a.currency_code || "ARS")}</Badge>
                  </div>
                  <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
                    {formatCurrency(Number(a.current_balance ?? 0))}
                  </p>
                </Card>
              ))}
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Últimos movimientos bancarios
            </h3>
            {txLoading && <PageLoader />}
            {!txLoading &&
              (Array.isArray(txItems) ? txItems : []).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">
                  Sin movimientos bancarios
                </p>
              )}
            {(Array.isArray(txItems) ? txItems : []).length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Cuenta</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3 text-right">Monto</th>
                        <th className="px-4 py-3 hidden sm:table-cell">Ref.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(Array.isArray(txItems) ? txItems : []).map(
                        (t: Record<string, unknown>) => (
                          <tr key={String(t.id)} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                              {formatDate(String(t.transaction_date))}
                            </td>
                            <td className="px-4 py-3">
                              {accountMap[String(t.account_id)] || "—"}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={
                                  String(t.direction) === "in" ||
                                  String(t.transaction_type).includes("deposit") ||
                                  String(t.transaction_type) === "transfer_in"
                                    ? "success"
                                    : "danger"
                                }
                              >
                                {txTypeLabel[String(t.transaction_type)] ||
                                  String(t.transaction_type)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              {formatCurrency(Number(t.amount))}
                            </td>
                            <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">
                              {String(t.reference || t.description || "—")}
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
        </div>
      )}

      {/* Modal: nueva caja */}
      <Modal
        open={showRegisterForm}
        onClose={() => setShowRegisterForm(false)}
        title="Nueva caja"
        description="Registradora física o virtual"
        size="sm"
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!regName.trim()) {
              toastError("El nombre es obligatorio");
              return;
            }
            createRegMut.mutate({
              name: regName.trim(),
              code: regCode.trim() || undefined,
            });
          }}
        >
          <Input
            label="Nombre *"
            value={regName}
            onChange={(e) => setRegName(e.target.value)}
            placeholder="Caja principal, Mostrador 1..."
            required
          />
          <Input
            label="Código"
            value={regCode}
            onChange={(e) => setRegCode(e.target.value)}
            placeholder="CAJA-01"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowRegisterForm(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={createRegMut.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: abrir sesión */}
      <Modal
        open={!!openRegisterId}
        onClose={() => setOpenRegisterId(null)}
        title="Abrir sesión de caja"
        description={
          openRegisterId
            ? registerMap[openRegisterId] || "Caja"
            : undefined
        }
        size="sm"
      >
        <div className="grid gap-4">
          <Input
            label="Monto de apertura"
            type="number"
            min={0}
            step="any"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
            hint="Efectivo con el que arranca el turno"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpenRegisterId(null)}
            >
              Cancelar
            </Button>
            <Button
              loading={openMut.isPending}
              onClick={() =>
                openRegisterId &&
                openMut.mutate({
                  register_id: openRegisterId,
                  opening_amount: parseFloat(openingAmount) || 0,
                })
              }
            >
              <Unlock className="h-4 w-4" /> Abrir
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: cerrar sesión */}
      <Modal
        open={!!closeSessionId}
        onClose={() => setCloseSessionId(null)}
        title="Cerrar sesión de caja"
        description="Contá el efectivo real y registrá el cierre"
        size="sm"
      >
        <div className="grid gap-4">
          <Input
            label="Efectivo contado *"
            type="number"
            min={0}
            step="any"
            value={closingAmount}
            onChange={(e) => setClosingAmount(e.target.value)}
            required
          />
          <Input
            label="Notas"
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder="Opcional"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCloseSessionId(null)}
            >
              Cancelar
            </Button>
            <Button
              loading={closeMut.isPending}
              onClick={() => {
                const amount = parseFloat(closingAmount);
                if (isNaN(amount) || amount < 0) {
                  toastError("Indicá el efectivo contado");
                  return;
                }
                closeSessionId &&
                  closeMut.mutate({
                    id: closeSessionId,
                    payload: {
                      closing_amount: amount,
                      notes: closeNotes || undefined,
                    },
                  });
              }}
            >
              <Lock className="h-4 w-4" /> Cerrar caja
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: movimiento de caja */}
      <Modal
        open={showMovement}
        onClose={() => setShowMovement(false)}
        title="Movimiento de caja"
        description="Ingreso o egreso manual en la sesión"
        size="sm"
      >
        <div className="grid gap-4">
          <Select
            label="Dirección"
            value={movDirection}
            onChange={(e) => setMovDirection(e.target.value)}
            options={[
              { value: "income", label: "Ingreso (+)" },
              { value: "expense", label: "Egreso (−)" },
            ]}
          />
          <Select
            label="Tipo"
            value={movType}
            onChange={(e) => setMovType(e.target.value)}
            options={[
              { value: "deposit", label: "Depósito" },
              { value: "withdrawal", label: "Retiro" },
              { value: "adjustment", label: "Ajuste" },
              { value: "transfer", label: "Transferencia" },
              { value: "other", label: "Otro" },
            ]}
          />
          <Input
            label="Monto *"
            type="number"
            min={0.01}
            step="any"
            value={movAmount}
            onChange={(e) => setMovAmount(e.target.value)}
          />
          <Input
            label="Descripción"
            value={movDesc}
            onChange={(e) => setMovDesc(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowMovement(false)}
            >
              Cancelar
            </Button>
            <Button
              loading={movMut.isPending}
              onClick={() => {
                const amount = parseFloat(movAmount);
                if (!movSessionId || isNaN(amount) || amount <= 0) {
                  toastError("Completá monto y sesión");
                  return;
                }
                movMut.mutate({
                  session_id: movSessionId,
                  direction: movDirection,
                  amount,
                  movement_type: movType,
                  description: movDesc || undefined,
                });
              }}
            >
              Registrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: cuenta bancaria */}
      <Modal
        open={showBankForm}
        onClose={() => setShowBankForm(false)}
        title="Nueva cuenta bancaria"
        size="md"
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!bankName.trim()) {
              toastError("El nombre es obligatorio");
              return;
            }
            bankMut.mutate({
              name: bankName.trim(),
              bank_name: bankBankName.trim() || undefined,
              account_number: bankNumber.trim() || undefined,
              currency_code: bankCurrency,
              current_balance: parseFloat(bankBalance) || 0,
            });
          }}
        >
          <Input
            label="Nombre *"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Cuenta corriente principal"
            required
            className="sm:col-span-2"
          />
          <Input
            label="Banco"
            value={bankBankName}
            onChange={(e) => setBankBankName(e.target.value)}
            placeholder="Banco Galicia, Santander..."
          />
          <Input
            label="Nº de cuenta"
            value={bankNumber}
            onChange={(e) => setBankNumber(e.target.value)}
          />
          <Select
            label="Moneda"
            value={bankCurrency}
            onChange={(e) => setBankCurrency(e.target.value)}
            options={[
              { value: "ARS", label: "ARS" },
              { value: "USD", label: "USD" },
              { value: "EUR", label: "EUR" },
              { value: "UYU", label: "UYU" },
            ]}
          />
          <Input
            label="Saldo inicial"
            type="number"
            step="any"
            value={bankBalance}
            onChange={(e) => setBankBalance(e.target.value)}
          />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowBankForm(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={bankMut.isPending}>
              Crear cuenta
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: movimiento bancario */}
      <Modal
        open={showTxForm}
        onClose={() => setShowTxForm(false)}
        title="Movimiento bancario"
        size="sm"
      >
        <div className="grid gap-4">
          <Select
            label="Cuenta *"
            value={txAccountId}
            onChange={(e) => setTxAccountId(e.target.value)}
            options={[
              { value: "", label: "Seleccionar..." },
              ...bankList.map((a: Record<string, unknown>) => ({
                value: String(a.id),
                label: String(a.name),
              })),
            ]}
          />
          <Select
            label="Tipo"
            value={txType}
            onChange={(e) => setTxType(e.target.value)}
            options={[
              { value: "deposit", label: "Depósito" },
              { value: "withdrawal", label: "Extracción" },
              { value: "transfer_in", label: "Transferencia entrante" },
              { value: "transfer_out", label: "Transferencia saliente" },
              { value: "fee", label: "Comisión" },
              { value: "adjustment", label: "Ajuste" },
            ]}
          />
          <Input
            label="Monto *"
            type="number"
            min={0.01}
            step="any"
            value={txAmount}
            onChange={(e) => setTxAmount(e.target.value)}
          />
          <Input
            label="Referencia"
            value={txReference}
            onChange={(e) => setTxReference(e.target.value)}
          />
          <Input
            label="Descripción"
            value={txDescription}
            onChange={(e) => setTxDescription(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowTxForm(false)}
            >
              Cancelar
            </Button>
            <Button
              loading={txMut.isPending}
              onClick={() => {
                const amount = parseFloat(txAmount);
                if (!txAccountId || isNaN(amount) || amount <= 0) {
                  toastError("Completá cuenta y monto");
                  return;
                }
                txMut.mutate({
                  account_id: txAccountId,
                  transaction_type: txType,
                  amount,
                  reference: txReference || undefined,
                  description: txDescription || undefined,
                });
              }}
            >
              Registrar
            </Button>
          </div>
        </div>
      </Modal>
    
      {tab === "checks" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Cheques de terceros (cobros) y propios (pagos). Depositar suma a la cuenta banco; Acreditar descuenta de la cuenta.
          </p>
          {checksLoading && <PageLoader />}
          {!checksLoading && (!(checks as unknown[]) || (checks as unknown[]).length === 0) && (
            <EmptyState title="Sin cheques" description="Se cargan al emitir recibos o órdenes de pago con medio cheque." />
          )}
          <div className="space-y-2">
            {(Array.isArray(checks) ? checks : []).map((c: Record<string, unknown>) => {
              const days = c.days_to_due as number | null | undefined;
              const dueLabel =
                days === null || days === undefined
                  ? "—"
                  : days < 0
                    ? `Vencido hace ${Math.abs(days)} día(s)`
                    : days === 0
                      ? "Vence hoy"
                      : `Vence en ${days} día(s)`;
              return (
                <div key={String(c.id)} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {String(c.check_number)} · {String(c.bank_name || "Sin banco")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {c.check_kind === "own" ? "Propio" : "Terceros"} · {String(c.status)} · {dueLabel}
                    </p>
                    <p className="text-sm font-semibold tabular-nums mt-1">{formatCurrency(Number(c.amount))}</p>
                  </div>
                  <div className="flex gap-2">
                    {String(c.status) === "pending" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const bank = window.prompt("ID de cuenta bancaria para depositar:");
                          if (!bank) return;
                          checkStatusMut.mutate({ id: String(c.id), status: "deposited", bank_account_id: bank });
                        }}
                      >
                        Depositar
                      </Button>
                    )}
                    {(String(c.status) === "pending" || String(c.status) === "deposited") && (
                      <Button
                        size="sm"
                        onClick={() => {
                          const bank = window.prompt("ID de cuenta bancaria para acreditar/debitar:");
                          if (!bank) return;
                          checkStatusMut.mutate({ id: String(c.id), status: "cleared", bank_account_id: bank });
                        }}
                      >
                        Acreditar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </AppShell>
  );
}
