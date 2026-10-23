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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  listOrders,
  getOrder,
  createOrder,
  confirmOrder,
  cancelOrder,
  markOrderDone,
  invoiceFromOrder,
  listPartners,
  listProducts,
  listInvoices,
  createPayment,
  listBankAccounts,
  openPrintDocument,
  createCreditNote,
  listCreditNotes,
  listDebitNotes,
  createDebitNote,
  listPayments,
  listDeliveryNotes,
  createDeliveryNoteFromOrder,
  listWarehouses,
  listPriceLists,
  getPriceList,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus,
  X,
  Check,
  FileText,
  Ban,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  CheckCircle2,
  CreditCard,
  Printer,
  RotateCcw,
  Search,
  Truck,
} from "lucide-react";
import type { BadgeVariant } from "@/components/ui/Badge";

const statusMeta: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Borrador", variant: "default" },
  confirmed: { label: "Confirmado", variant: "info" },
  done: { label: "Cerrado", variant: "success" },
  cancelled: { label: "Cancelado", variant: "danger" },
  posted: { label: "Contabilizada", variant: "success" },
  paid: { label: "Pagada", variant: "success" },
  partial: { label: "Pago parcial", variant: "warning" },
  open: { label: "Abierta", variant: "info" },
};

const typeLabel: Record<string, string> = {
  quotation: "Cotización",
  order: "Pedido",
};

interface LineForm {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_rate: number;
}

export default function SalesPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState<"orders" | "invoices" | "credit-notes" | "debit-notes" | "receipts" | "remitos">("orders");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [payInvoice, setPayInvoice] = useState<Record<string, unknown> | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payReference, setPayReference] = useState("");
  const [payBankAccount, setPayBankAccount] = useState("");
  const [payCheckNumber, setPayCheckNumber] = useState("");
  const [payCheckBank, setPayCheckBank] = useState("");
  const [payCheckDue, setPayCheckDue] = useState("");

  // Credit note
  const [ndInvoice, setNdInvoice] = useState<Record<string, unknown> | null>(null);
  const [ncInvoice, setNcInvoice] = useState<Record<string, unknown> | null>(null);
  const [ncReason, setNcReason] = useState("return");
  const [ncNotes, setNcNotes] = useState("");
  const [ncWarehouseId, setNcWarehouseId] = useState("");
  const [ncRestoreStock, setNcRestoreStock] = useState(true);

  // Create form
  const [partnerId, setPartnerId] = useState("");
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [activePriceListId, setActivePriceListId] = useState("");
  const [orderType, setOrderType] = useState("order");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["orders", statusFilter, typeFilter],
    queryFn: () =>
      listOrders({
        page_size: 50,
        status: statusFilter || undefined,
        order_type: typeFilter || undefined,
      }),
    enabled: tab === "orders",
  });

  const { data: invoices, isLoading: invLoading } = useQuery({
    queryKey: ["invoices", invoiceStatusFilter],
    queryFn: () =>
      listInvoices({
        page_size: 50,
        status: invoiceStatusFilter || undefined,
      }),
    enabled: tab === "invoices",
  });

  const { data: creditNotes, isLoading: ncLoading } = useQuery({
    queryKey: ["credit-notes"],
    queryFn: () => listCreditNotes({ page_size: 50 }),
    enabled: tab === "credit-notes",
  });

  const { data: debitNotes, isLoading: ndLoading } = useQuery({
    queryKey: ["debit-notes"],
    queryFn: () => listDebitNotes({ page_size: 50 }),
    enabled: tab === "debit-notes",
  });

  const { data: receipts, isLoading: recLoading } = useQuery({
    queryKey: ["payments"],
    queryFn: () => listPayments({ page_size: 50 }),
    enabled: tab === "receipts",
  });

  const { data: remitos, isLoading: remLoading } = useQuery({
    queryKey: ["delivery-notes"],
    queryFn: () => listDeliveryNotes({ page_size: 50 }),
    enabled: tab === "remitos",
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: listWarehouses,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers"],
    queryFn: () => listPartners({ partner_type: "customer", page_size: 100 }),
  });

  const { data: products } = useQuery({
    queryKey: ["products-for-so", productSearch],
    queryFn: () =>
      listProducts({ search: productSearch || undefined, page_size: 20 }),
    enabled: showForm && productSearch.length > 0,
  });

  const partnerMap = useMemo(() => {
    const map: Record<string, string> = {};
    (customers?.items || []).forEach((c: Record<string, unknown>) => {
      map[String(c.id)] = String(c.name);
    });
    return map;
  }, [customers]);


  // Lista de precios del cliente (o lista default)
  const { data: allPriceLists } = useQuery({
    queryKey: ["price-lists"],
    queryFn: () => listPriceLists({ page_size: 50 }),
  });

  async function loadPricesForPartner(pid: string) {
    setPriceMap({});
    setActivePriceListId("");
    const partners = customers?.items || [];
    const partner = partners.find((c: Record<string, unknown>) => String(c.id) === pid);
    let listId = partner?.price_list_id ? String(partner.price_list_id) : "";
    if (!listId) {
      const lists = allPriceLists?.items || [];
      const def = lists.find((pl: Record<string, unknown>) => pl.is_default) || lists[0];
      if (def) listId = String(def.id);
    }
    if (!listId) return;
    setActivePriceListId(listId);
    try {
      const detail = await getPriceList(listId);
      const map: Record<string, number> = {};
      for (const it of detail?.items || []) {
        map[String(it.product_id)] = Number(it.price) || 0;
      }
      setPriceMap(map);
    } catch {
      /* ignore */
    }
  }

  const createMut = useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      success(
        orderType === "quotation" ? "Cotización creada" : "Pedido creado"
      );
      closeForm();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al crear el documento";
      toastError("Error", String(msg));
    },
  });

  
  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => listBankAccounts(),
  });

  const actionMut = useMutation({
    mutationFn: async ({
      action,
      id,
      payload,
    }: {
      action: string;
      id: string;
      payload?: unknown;
    }) => {
      if (action === "confirm") return confirmOrder(id);
      if (action === "cancel") return cancelOrder(id);
      if (action === "done") return markOrderDone(id);
      if (action === "invoice") return invoiceFromOrder(id, payload || {});
      if (action === "pay") return createPayment(payload);
      throw new Error("Acción desconocida");
    },
    onSuccess: async (_, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["checks"] });
      const labels: Record<string, string> = {
        confirm: "Documento confirmado",
        cancel: "Documento cancelado",
        done: "Pedido cerrado",
        invoice: "Factura generada",
        pay: "Recibo emitido",
      };
      success(labels[vars.action] || "Listo");
      if (expandedId === vars.id && vars.action !== "pay") {
        try {
          const d = await getOrder(vars.id);
          setDetail(d);
        } catch {
          /* ignore */
        }
      }
      setCancelId(null);
      setPayInvoice(null);
      setPayAmount("");
      setPayReference("");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error en la operación";
      toastError("Error", String(msg));
    },
  });

  const ncMut = useMutation({
    mutationFn: createCreditNote,
    onSuccess: (data: Record<string, unknown>) => {
      qc.invalidateQueries({ queryKey: ["credit-notes"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      success("Nota de crédito emitida", String(data.invoice_number || ""));
      setNcInvoice(null);
      setNcReason("return");
      setNcNotes("");
      setNcWarehouseId("");
      setNcRestoreStock(true);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al emitir NC";
      toastError("Error", String(msg));
    },
  });

  const ndMut = useMutation({
    mutationFn: createDebitNote,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debit-notes"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      success("Nota de débito emitida");
      setNdInvoice(null);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Error al emitir ND";
      toastError("Error", String(msg));
    },
  });

  function resetForm() {
    setPartnerId("");
    setOrderType("order");
    setNotes("");
    setLines([]);
    setProductSearch("");
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
  }

  function addProduct(p: Record<string, unknown>) {
    if (lines.some((l) => l.product_id === String(p.id))) return;
    const pid = String(p.id);
    const price = priceMap[pid] ?? 0;
    setLines([
      ...lines,
      {
        product_id: pid,
        product_name: String(p.name),
        quantity: 1,
        unit_price: price,
        discount_pct: 0,
        tax_rate: 21,
      },
    ]);
  }

  function removeLine(productId: string) {
    setLines(lines.filter((l) => l.product_id !== productId));
  }

  function updateLine(productId: string, patch: Partial<LineForm>) {
    setLines(lines.map((x) => (x.product_id === productId ? { ...x, ...patch } : x)));
  }

  const formTotal = lines.reduce((s, l) => {
    const st = l.quantity * l.unit_price * (1 - l.discount_pct / 100);
    return s + st * (1 + l.tax_rate / 100);
  }, 0);

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    try {
      const d = await getOrder(id);
      setDetail(d);
    } catch {
      toastError("No se pudo cargar el detalle");
      setExpandedId(null);
    }
  }

  function submitCreate() {
    if (!partnerId) {
      toastError("Seleccioná un cliente");
      return;
    }
    if (lines.length === 0) {
      toastError("Agregá al menos un producto");
      return;
    }
    if (lines.some((l) => l.quantity <= 0 || l.unit_price < 0)) {
      toastError("Revisá cantidades y precios");
      return;
    }
    createMut.mutate({
      partner_id: partnerId,
      order_type: orderType,
      notes: notes || undefined,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct,
        tax_rate: l.tax_rate,
      })),
    });
  }

  function openPay(inv: Record<string, unknown>) {
    setPayInvoice(inv);
    const due = Number(inv.amount_due ?? inv.total ?? 0);
    setPayAmount(String(due > 0 ? due : inv.total ?? ""));
    setPayMethod("cash");
    setPayReference("");
  }

  function submitPay() {
    if (!payInvoice) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      toastError("Monto inválido");
      return;
    }
    actionMut.mutate({
      action: "pay",
      id: String(payInvoice.id),
      payload: {
        partner_id: payInvoice.partner_id,
        invoice_id: payInvoice.id,
        amount,
        payment_method: payMethod,
        reference: payReference || undefined,
        bank_account_id: payMethod === "transfer" ? payBankAccount || undefined : undefined,
        check_number: payMethod === "check" ? payCheckNumber || undefined : undefined,
        check_bank_name: payMethod === "check" ? payCheckBank || undefined : undefined,
        check_due_date: payMethod === "check" && payCheckDue ? payCheckDue : undefined,
      },
    });
  }

  const orderItems = (data?.items || []).filter((o: Record<string, unknown>) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(o.order_number || "").toLowerCase().includes(q) ||
      (partnerMap[String(o.partner_id)] || "").toLowerCase().includes(q)
    );
  });

  const invoiceItems = (invoices?.items || []).filter(
    (inv: Record<string, unknown>) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        String(inv.invoice_number || "").toLowerCase().includes(q) ||
        (partnerMap[String(inv.partner_id)] || "").toLowerCase().includes(q)
      );
    }
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ventas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cotizaciones, pedidos, facturas y notas de crédito
          </p>
        </div>
        {tab === "orders" && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-lg bg-slate-100 p-1 w-full sm:w-fit overflow-x-auto">
        {(
          [
            { id: "orders" as const, label: "Pedidos / Cotizaciones" },
            { id: "invoices" as const, label: "Facturas" },
            { id: "credit-notes" as const, label: "Notas de crédito" },
            { id: "debit-notes" as const, label: "Notas de débito" },
            { id: "receipts" as const, label: "Recibos" },
            { id: "remitos" as const, label: "Remitos" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setSearch("");
            }}
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

      {/* Search + filters */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder={
              tab === "orders"
                ? "Buscar por número o cliente..."
                : "Buscar factura o cliente..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab === "orders" && (
          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: "Todos" },
              { value: "draft", label: "Borrador" },
              { value: "confirmed", label: "Confirmados" },
              { value: "done", label: "Cerrados" },
              /* cancelados ocultos */
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  statusFilter === f.value
                    ? "bg-brand-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="mx-1 text-slate-300 self-center">|</span>
            {[
              { value: "", label: "Todos los tipos" },
              { value: "quotation", label: "Cotizaciones" },
              { value: "order", label: "Pedidos" },
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  typeFilter === f.value
                    ? "bg-slate-800 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {tab === "invoices" && (
          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: "Todas" },
              { value: "draft", label: "Borrador" },
              { value: "posted", label: "Contabilizadas" },
              { value: "partial", label: "Pago parcial" },
              { value: "paid", label: "Pagadas" },
              /* canceladas ocultas */
            ].map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setInvoiceStatusFilter(f.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  invoiceStatusFilter === f.value
                    ? "bg-brand-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ===== ORDERS ===== */}
      {tab === "orders" && (
        <div className="mt-6">
          {isLoading && <PageLoader />}

          {!isLoading && orderItems.length === 0 && (
            <EmptyState
              icon={ShoppingCart}
              title="No hay documentos de venta"
              description={
                statusFilter || typeFilter || search
                  ? "Ningún resultado con esos filtros."
                  : "Creá una cotización o pedido para empezar."
              }
              actionLabel={
                !statusFilter && !typeFilter && !search ? "Crear el primero" : undefined
              }
              onAction={
                !statusFilter && !typeFilter && !search
                  ? () => setShowForm(true)
                  : undefined
              }
            />
          )}

          <div className="space-y-2">
            {orderItems.map((o: Record<string, unknown>) => {
              const id = String(o.id);
              const isOpen = expandedId === id;
              const st = String(o.status);
              const ot = String(o.order_type);
              const meta = statusMeta[st] || {
                label: st,
                variant: "default" as BadgeVariant,
              };

              return (
                <div
                  key={id}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 sm:gap-4 px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => toggleExpand(id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {String(o.order_number)}
                        </span>
                        <Badge variant="default">{typeLabel[ot] || ot}</Badge>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDate(String(o.order_date))}
                        {partnerMap[String(o.partner_id)]
                          ? ` · ${partnerMap[String(o.partner_id)]}`
                          : ""}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums shrink-0">
                      {formatCurrency(Number(o.total))}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="h-5 w-5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {isOpen && detail && String(detail.id) === id && (
                    <div className="border-t border-slate-100 bg-slate-50 px-4 py-4">
                      {(detail.notes as string) && (
                        <p className="mb-3 text-sm text-slate-600">
                          <span className="font-medium">Notas:</span>{" "}
                          {String(detail.notes)}
                        </p>
                      )}

                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-left">Producto</th>
                              <th className="px-3 py-2 text-right">Cant.</th>
                              <th className="px-3 py-2 text-right">Precio</th>
                              <th className="px-3 py-2 text-right hidden sm:table-cell">
                                Desc.
                              </th>
                              <th className="px-3 py-2 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {((detail.lines as Record<string, unknown>[]) || []).map(
                              (ln) => (
                                <tr key={String(ln.id)}>
                                  <td className="px-3 py-2">
                                    {String(ln.description || ln.product_id).slice(
                                      0,
                                      40
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {Number(ln.quantity)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatCurrency(Number(ln.unit_price))}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">
                                    {Number(ln.discount_pct)}%
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                                    {formatCurrency(Number(ln.subtotal))}
                                  </td>
                                </tr>
                              )
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-200 bg-slate-50">
                              <td
                                colSpan={4}
                                className="px-3 py-2 text-right text-sm font-medium text-slate-600"
                              >
                                Total
                              </td>
                              <td className="px-3 py-2 text-right font-bold tabular-nums">
                                {formatCurrency(Number(detail.total))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {st === "draft" && (
                          <>
                            <Button
                              size="sm"
                              loading={actionMut.isPending}
                              onClick={() =>
                                actionMut.mutate({ action: "confirm", id })
                              }
                            >
                              <Check className="h-4 w-4" /> Confirmar
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setCancelId(id)}
                            >
                              <Ban className="h-4 w-4" /> Cancelar
                            </Button>
                          </>
                        )}
                        {st === "confirmed" && (
                          <>
                            <Button
                              size="sm"
                              loading={actionMut.isPending}
                              onClick={() =>
                                actionMut.mutate({ action: "invoice", id })
                              }
                            >
                              <FileText className="h-4 w-4" /> Facturar
                            </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            createDeliveryNoteFromOrder(String(o.id), {})
                              .then(() => {
                                qc.invalidateQueries({ queryKey: ["delivery-notes"] });
                                success("Remito generado");
                              })
                              .catch((e: unknown) => {
                                const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Error";
                                toastError("Error", String(msg));
                              });
                          }}
                        >
                          Remito
                        </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={actionMut.isPending}
                              onClick={() =>
                                actionMut.mutate({ action: "done", id })
                              }
                            >
                              <CheckCircle2 className="h-4 w-4" /> Cerrar
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => setCancelId(id)}
                            >
                              <Ban className="h-4 w-4" /> Cancelar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== INVOICES ===== */}
      {tab === "invoices" && (
        <div className="mt-6">
          {invLoading && <PageLoader />}

          {!invLoading && invoiceItems.length === 0 && (
            <EmptyState
              icon={FileText}
              title="No hay facturas"
              description="Las facturas se generan desde pedidos confirmados."
            />
          )}

          {!invLoading && invoiceItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Cliente</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right hidden md:table-cell">
                        Saldo
                      </th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoiceItems.map((inv: Record<string, unknown>) => {
                      const st = String(inv.status);
                      const meta = statusMeta[st] || {
                        label: st,
                        variant: "default" as BadgeVariant,
                      };
                      const due = Number(inv.amount_due ?? 0);
                      const canPay =
                        due > 0 && st !== "cancelled" && st !== "paid";
                      return (
                        <tr key={String(inv.id)} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-mono text-sm font-semibold">
                            {String(inv.invoice_number)}
                          </td>
                          <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                            {partnerMap[String(inv.partner_id)] || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {formatDate(String(inv.invoice_date))}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {formatCurrency(Number(inv.total))}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                            {formatCurrency(due)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1 flex-wrap">
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Imprimir / PDF"
                                onClick={async () => {
                                  try {
                                    await openPrintDocument(
                                      "invoice",
                                      String(inv.id)
                                    );
                                  } catch (e) {
                                    toastError(
                                      "No se pudo abrir la impresión",
                                      e instanceof Error ? e.message : undefined
                                    );
                                  }
                                }}
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                              {String(inv.invoice_type || "invoice") === "invoice" &&
                                st !== "cancelled" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Nota de crédito"
                                  onClick={() => {
                                    setNcInvoice(inv);
                                    setNcReason("return");
                                    setNcNotes("");
                                    setNcRestoreStock(true);
                                  }}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {String(inv.invoice_type || "invoice") === "invoice" &&
                                st !== "cancelled" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  title="Nota de débito"
                                  onClick={() => setNdInvoice(inv)}
                                >
                                  ND
                                </Button>
                              )}
                              {canPay && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openPay(inv)}
                                >
                                  <CreditCard className="h-3.5 w-3.5" /> Cobrar
                                </Button>
                              )}
                            </div>
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


      {/* ===== CREDIT NOTES ===== */}
      {tab === "credit-notes" && (
        <div className="mt-6">
          {ncLoading && <PageLoader />}
          {!ncLoading && (creditNotes?.items || []).length === 0 && (
            <EmptyState
              icon={RotateCcw}
              title="Sin notas de crédito"
              description="Emití una NC desde una factura (botón de devolución en Facturas)."
            />
          )}
          {!ncLoading && (creditNotes?.items || []).length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Cliente</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Motivo</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(creditNotes?.items || []).map((nc: Record<string, unknown>) => {
                      const reasonLabel: Record<string, string> = {
                        return: "Devolución",
                        discount: "Descuento",
                        error: "Error",
                        other: "Otro",
                      };
                      return (
                        <tr key={String(nc.id)} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-mono text-sm font-semibold">
                            {String(nc.invoice_number)}
                          </td>
                          <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                            {partnerMap[String(nc.partner_id)] || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                            {formatDate(String(nc.invoice_date))}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="warning">
                              {reasonLabel[String(nc.credit_reason)] ||
                                String(nc.credit_reason || "NC")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {formatCurrency(Number(nc.total))}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Imprimir NC"
                                onClick={async () => {
                                  try {
                                    await openPrintDocument(
                                      "invoice",
                                      String(nc.id)
                                    );
                                  } catch (e) {
                                    toastError(
                                      "No se pudo abrir la impresión",
                                      e instanceof Error ? e.message : undefined
                                    );
                                  }
                                }}
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                            </div>
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


      {tab === "debit-notes" && (
        <div className="mt-6">
          {ndLoading && <PageLoader />}
          {!ndLoading && (debitNotes?.items || []).length === 0 && (
            <EmptyState icon={FileText} title="Sin notas de débito" description="Emití una ND desde una factura." />
          )}
          {!ndLoading && (debitNotes?.items || []).length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Número</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(debitNotes?.items || []).map((nd: Record<string, unknown>) => (
                    <tr key={String(nd.id)}>
                      <td className="px-4 py-3 font-mono font-semibold">{String(nd.invoice_number)}</td>
                      <td className="px-4 py-3">{partnerMap[String(nd.partner_id)] || "—"}</td>
                      <td className="px-4 py-3">{formatDate(String(nd.invoice_date))}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(Number(nd.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "receipts" && (
        <div className="mt-6">
          {recLoading && <PageLoader />}
          {!recLoading && (receipts?.items || []).length === 0 && (
            <EmptyState icon={CreditCard} title="Sin recibos" description="Se generan al cobrar una factura." />
          )}
          {!recLoading && (receipts?.items || []).length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Recibo</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Medio</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(receipts?.items || []).map((r: Record<string, unknown>) => (
                    <tr key={String(r.id)}>
                      <td className="px-4 py-3 font-mono font-semibold">{String(r.receipt_number || "—")}</td>
                      <td className="px-4 py-3">{partnerMap[String(r.partner_id)] || "—"}</td>
                      <td className="px-4 py-3">{formatDate(String(r.payment_date))}</td>
                      <td className="px-4 py-3 capitalize">{String(r.payment_method || "—")}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(Number(r.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "remitos" && (
        <div className="mt-6">
          {remLoading && <PageLoader />}
          {!remLoading && (remitos?.items || []).length === 0 && (
            <EmptyState icon={Truck} title="Sin remitos" description="Generá un remito desde un pedido confirmado." />
          )}
          {!remLoading && (remitos?.items || []).length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Número</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(remitos?.items || []).map((n: Record<string, unknown>) => (
                    <tr key={String(n.id)}>
                      <td className="px-4 py-3 font-mono font-semibold">{String(n.note_number || "—")}</td>
                      <td className="px-4 py-3">{partnerMap[String(n.partner_id)] || "—"}</td>
                      <td className="px-4 py-3">{formatDate(String(n.note_date || n.created_at))}</td>
                      <td className="px-4 py-3 capitalize">{String(n.status || "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: nuevo documento */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title="Nuevo documento de venta"
        description="Cotización o pedido con líneas de productos"
        size="xl"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Tipo *"
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
            options={[
              { value: "order", label: "Pedido" },
              { value: "quotation", label: "Cotización" },
            ]}
          />
          <Select
            label="Cliente *"
            value={partnerId}
            onChange={(e) => { setPartnerId(e.target.value); loadPricesForPartner(e.target.value); }}
            options={[
              { value: "", label: "Seleccionar cliente..." },
              ...(customers?.items || []).map((c: Record<string, unknown>) => ({
                value: String(c.id),
                label: String(c.name),
              })),
            ]}
            hint={
              !customers?.items?.length
                ? "No hay clientes. Creá uno en Clientes."
                : undefined
            }
          />
          <Input
            label="Notas"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="mt-4">
          <label className="label">Agregar productos</label>
          <input
            className="input"
            placeholder="Escribí para buscar producto..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />
          {productSearch && (products?.items?.length ?? 0) > 0 && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              {products!.items.map((p: Record<string, unknown>) => (
                <button
                  key={String(p.id)}
                  type="button"
                  onClick={() => {
                    addProduct(p);
                    setProductSearch("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-brand-50 text-left"
                >
                  <span>{String(p.name)}</span>
                  <span className="text-xs text-slate-400">
                    {String(p.sku || "")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Producto</th>
                  <th className="px-3 py-2 text-right w-20">Cant.</th>
                  <th className="px-3 py-2 text-right w-24">Precio</th>
                  <th className="px-3 py-2 text-right w-20 hidden sm:table-cell">
                    Desc %
                  </th>
                  <th className="px-3 py-2 text-right w-20 hidden md:table-cell">
                    IVA %
                  </th>
                  <th className="px-3 py-2 text-right w-28">Subtotal</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const st =
                    l.quantity * l.unit_price * (1 - l.discount_pct / 100);
                  return (
                    <tr key={l.product_id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">{l.product_name}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0.01}
                          step="any"
                          className="input py-1 text-right"
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.product_id, {
                              quantity: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="input py-1 text-right"
                          value={l.unit_price}
                          onChange={(e) =>
                            updateLine(l.product_id, {
                              unit_price: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          className="input py-1 text-right"
                          value={l.discount_pct}
                          onChange={(e) =>
                            updateLine(l.product_id, {
                              discount_pct: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          className="input py-1 text-right"
                          value={l.tax_rate}
                          onChange={(e) =>
                            updateLine(l.product_id, {
                              tax_rate: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(st * (1 + l.tax_rate / 100))}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(l.product_id)}
                          className="rounded p-1 text-slate-400 hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-4 py-3 text-lg font-bold">
              Total: {formatCurrency(formTotal)}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={closeForm}>
            Cancelar
          </Button>
          <Button
            loading={createMut.isPending}
            disabled={!partnerId || lines.length === 0}
            onClick={submitCreate}
          >
            Crear {orderType === "quotation" ? "cotización" : "pedido"}
          </Button>
        </div>
      </Modal>

      {/* Modal: cobro */}
      <Modal
        open={!!payInvoice}
        onClose={() => setPayInvoice(null)}
        title="Registrar cobro"
        description={
          payInvoice
            ? `Factura ${String(payInvoice.invoice_number)} · Saldo ${formatCurrency(
                Number(payInvoice.amount_due ?? 0)
              )}`
            : undefined
        }
        size="sm"
      >
        <div className="grid gap-4">
          <Input
            label="Monto *"
            type="number"
            min={0.01}
            step="any"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
          />
          <Select
            label="Medio de pago"
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value)}
            options={[
              { value: "cash", label: "Efectivo" },
              { value: "transfer", label: "Transferencia bancaria" },
              { value: "card", label: "Tarjeta" },
              { value: "check", label: "Cheque de terceros" },
              { value: "other", label: "Otro" },
            ]}
          />
          {payMethod === "transfer" && (
            <Select
              label="Cuenta bancaria *"
              value={payBankAccount}
              onChange={(e) => setPayBankAccount(e.target.value)}
              options={(Array.isArray(bankAccounts) ? bankAccounts : bankAccounts?.items || []).map(
                (a: Record<string, unknown>) => ({
                  value: String(a.id),
                  label: `${a.name}${a.bank_name ? ` (${a.bank_name})` : ""}`,
                })
              )}
              placeholder="Seleccionar cuenta"
            />
          )}
          {payMethod === "check" && (
            <>
              <Input
                label="N° de cheque *"
                value={payCheckNumber}
                onChange={(e) => setPayCheckNumber(e.target.value)}
              />
              <Input
                label="Banco del cheque"
                value={payCheckBank}
                onChange={(e) => setPayCheckBank(e.target.value)}
              />
              <Input
                label="Fecha de vencimiento"
                type="date"
                value={payCheckDue}
                onChange={(e) => setPayCheckDue(e.target.value)}
              />
            </>
          )}
          <Input
            label="Referencia / detalle"
            value={payReference}
            onChange={(e) => setPayReference(e.target.value)}
            placeholder="N° de operación, CBU, observaciones..."
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPayInvoice(null)}
            >
              Cancelar
            </Button>
            <Button loading={actionMut.isPending} onClick={submitPay}>
              <CreditCard className="h-4 w-4" /> Emitir recibo
            </Button>
          </div>
        </div>
      </Modal>


      
      <Modal
        open={!!ndInvoice}
        onClose={() => setNdInvoice(null)}
        title="Emitir nota de débito"
        description={
          ndInvoice
            ? `Sobre factura ${String(ndInvoice.invoice_number)} · ${formatCurrency(Number(ndInvoice.total))}`
            : undefined
        }
        size="sm"
      >
        <div className="grid gap-4">
          <p className="text-sm text-slate-600">
            La ND aumenta el saldo a cobrar del cliente (cuenta corriente).
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNdInvoice(null)}>Cancelar</Button>
            <Button
              loading={ndMut?.isPending}
              onClick={() => {
                if (!ndInvoice) return;
                ndMut.mutate({ related_invoice_id: ndInvoice.id, reason: "other" });
              }}
            >
              Emitir ND
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: nota de crédito */}
      <Modal
        open={!!ncInvoice}
        onClose={() => setNcInvoice(null)}
        title="Emitir nota de crédito"
        description={
          ncInvoice
            ? `Sobre factura ${String(ncInvoice.invoice_number)} · ${formatCurrency(
                Number(ncInvoice.total)
              )}`
            : undefined
        }
        size="md"
      >
        <div className="grid gap-4">
          <Select
            label="Motivo *"
            value={ncReason}
            onChange={(e) => {
              const v = e.target.value;
              setNcReason(v);
              setNcRestoreStock(v === "return");
            }}
            options={[
              { value: "return", label: "Devolución (puede restaurar stock)" },
              { value: "discount", label: "Descuento / bonificación" },
              { value: "error", label: "Error de facturación" },
              { value: "other", label: "Otro" },
            ]}
          />
          {ncReason === "return" && (
            <>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={ncRestoreStock}
                  onChange={(e) => setNcRestoreStock(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                Reingresar stock de productos trackeados
              </label>
              {(warehouses || []).length > 0 && ncRestoreStock && (
                <Select
                  label="Almacén de reingreso"
                  value={ncWarehouseId}
                  onChange={(e) => setNcWarehouseId(e.target.value)}
                  options={[
                    { value: "", label: "Almacén principal / default" },
                    ...(warehouses || []).map((w: Record<string, unknown>) => ({
                      value: String(w.id),
                      label: String(w.name),
                    })),
                  ]}
                />
              )}
            </>
          )}
          <Input
            label="Notas"
            value={ncNotes}
            onChange={(e) => setNcNotes(e.target.value)}
            placeholder="Opcional"
          />
          <p className="text-xs text-slate-500">
            Se copian todas las líneas de la factura origen. El documento queda
            contabilizado al emitir.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setNcInvoice(null)}
            >
              Cancelar
            </Button>
            <Button
              loading={ncMut.isPending}
              onClick={() => {
                if (!ncInvoice) return;
                ncMut.mutate({
                  related_invoice_id: ncInvoice.id,
                  reason: ncReason,
                  notes: ncNotes || undefined,
                  warehouse_id: ncWarehouseId || undefined,
                  restore_stock: ncReason === "return" && ncRestoreStock,
                });
              }}
            >
              <RotateCcw className="h-4 w-4" /> Emitir NC
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!cancelId}
        onClose={() => setCancelId(null)}
        onConfirm={() =>
          cancelId && actionMut.mutate({ action: "cancel", id: cancelId })
        }
        title="Cancelar documento"
        description="El pedido o cotización quedará cancelado y no se podrá facturar."
        confirmLabel="Cancelar documento"
        loading={actionMut.isPending}
      />
    </AppShell>
  );
}
