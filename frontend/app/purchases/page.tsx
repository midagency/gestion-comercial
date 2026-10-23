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
import type { BadgeVariant } from "@/components/ui/Badge";
import {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  confirmPurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseGoods,
  invoiceFromPurchaseOrder,
  listSupplierInvoices,
  paySupplierInvoice,
  listBankAccounts,
  postSupplierInvoice,
  listPartners,
  listProducts,
  listWarehouses,
} from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus,
  X,
  Check,
  PackageCheck,
  FileText,
  Ban,
  ChevronDown,
  ChevronUp,
  Truck,
  CreditCard,
  Search,
  BookOpen,
} from "lucide-react";

const statusMeta: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Borrador", variant: "default" },
  confirmed: { label: "Confirmada", variant: "info" },
  partial: { label: "Parcial", variant: "warning" },
  received: { label: "Recibida", variant: "success" },
  cancelled: { label: "Cancelada", variant: "danger" },
  posted: { label: "Contabilizada", variant: "info" },
  paid: { label: "Pagada", variant: "success" },
  open: { label: "Abierta", variant: "info" },
};

interface LineForm {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

export default function PurchasesPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState<"orders" | "invoices">("orders");
  const [statusFilter, setStatusFilter] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const [cancelId, setCancelId] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [receiveWarehouseId, setReceiveWarehouseId] = useState("");

  const [payInvoice, setPayInvoice] = useState<Record<string, unknown> | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("transfer");
  const [payBankAccount, setPayBankAccount] = useState("");
  const [payCheckNumber, setPayCheckNumber] = useState("");
  const [payCheckBank, setPayCheckBank] = useState("");
  const [payCheckDue, setPayCheckDue] = useState("");
  const [payCheckKind, setPayCheckKind] = useState("own");
  const [payReference, setPayReference] = useState("");

  // Create form
  const [partnerId, setPartnerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineForm[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["purchase-orders", statusFilter],
    queryFn: () =>
      listPurchaseOrders({
        page_size: 50,
        status: statusFilter || undefined,
      }),
    enabled: tab === "orders",
  });

  const { data: invoices, isLoading: invLoading } = useQuery({
    queryKey: ["supplier-invoices", invoiceStatusFilter],
    queryFn: () =>
      listSupplierInvoices({
        page_size: 50,
        status: invoiceStatusFilter || undefined,
      }),
    enabled: tab === "invoices",
  });

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => listPartners({ partner_type: "supplier", page_size: 100 }),
  });

  const { data: products } = useQuery({
    queryKey: ["products-for-po", productSearch],
    queryFn: () =>
      listProducts({ search: productSearch || undefined, page_size: 20 }),
    enabled: showForm && productSearch.length > 0,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: listWarehouses,
  });

  const partnerMap = useMemo(() => {
    const map: Record<string, string> = {};
    (suppliers?.items || []).forEach((c: Record<string, unknown>) => {
      map[String(c.id)] = String(c.name);
    });
    return map;
  }, [suppliers]);

  const warehouseList = warehouses || [];

  const createMut = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      success("Orden de compra creada");
      closeForm();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al crear la OC";
      toastError("Error", String(msg));
    },
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
      if (action === "confirm") return confirmPurchaseOrder(id);
      if (action === "cancel") return cancelPurchaseOrder(id);
      if (action === "receive") return receivePurchaseGoods(id, payload);
      if (action === "invoice") return invoiceFromPurchaseOrder(id, payload || {});
      if (action === "pay") return paySupplierInvoice(payload);
      if (action === "post") return postSupplierInvoice(id);
      throw new Error("Acción desconocida");
    },
    onSuccess: async (_, vars) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      qc.invalidateQueries({ queryKey: ["stock-summary"] });
      const labels: Record<string, string> = {
        confirm: "OC confirmada",
        cancel: "OC cancelada",
        receive: "Mercadería recibida",
        invoice: "Factura de proveedor generada",
        pay: "Pago registrado",
        post: "Factura contabilizada",
      };
      success(labels[vars.action] || "Listo");
      if (
        expandedId === vars.id &&
        vars.action !== "pay" &&
        vars.action !== "post"
      ) {
        try {
          const d = await getPurchaseOrder(vars.id);
          setDetail(d);
          const qty: Record<string, number> = {};
          (d.lines as Record<string, unknown>[])?.forEach((ln) => {
            const pending = Number(
              ln.qty_pending ?? Number(ln.quantity) - Number(ln.qty_received)
            );
            if (pending > 0) qty[String(ln.id)] = pending;
          });
          setReceiveQty(qty);
        } catch {
          /* ignore */
        }
      }
      setCancelId(null);
      setShowReceive(false);
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

  function resetForm() {
    setPartnerId("");
    setWarehouseId("");
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
    setLines([
      ...lines,
      {
        product_id: String(p.id),
        product_name: String(p.name),
        quantity: 1,
        unit_price: 0,
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

  const formTotal = lines.reduce(
    (s, l) => s + l.quantity * l.unit_price * (1 + l.tax_rate / 100),
    0
  );

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setShowReceive(false);
      return;
    }
    setExpandedId(id);
    setShowReceive(false);
    try {
      const d = await getPurchaseOrder(id);
      setDetail(d);
      const qty: Record<string, number> = {};
      (d.lines as Record<string, unknown>[])?.forEach((ln) => {
        const pending = Number(
          ln.qty_pending ?? Number(ln.quantity) - Number(ln.qty_received)
        );
        if (pending > 0) qty[String(ln.id)] = pending;
      });
      setReceiveQty(qty);
      if (d.warehouse_id) setReceiveWarehouseId(String(d.warehouse_id));
      else if (warehouseList[0]) setReceiveWarehouseId(String(warehouseList[0].id));
    } catch {
      toastError("No se pudo cargar el detalle");
      setExpandedId(null);
    }
  }

  function submitCreate() {
    if (!partnerId) {
      toastError("Seleccioná un proveedor");
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
      warehouse_id: warehouseId || undefined,
      notes: notes || undefined,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        description: l.product_name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate,
      })),
    });
  }

  function openReceive() {
    setShowReceive(true);
  }

  function handleReceive() {
    if (!detail) return;
    const receiveLines = Object.entries(receiveQty)
      .filter(([, q]) => q > 0)
      .map(([line_id, quantity]) => ({ line_id, quantity }));
    if (receiveLines.length === 0) {
      toastError("Indicá al menos una cantidad a recibir");
      return;
    }
    actionMut.mutate({
      action: "receive",
      id: String(detail.id),
      payload: {
        lines: receiveLines,
        warehouse_id: receiveWarehouseId || undefined,
      },
    });
  }

  function openPay(inv: Record<string, unknown>) {
    setPayInvoice(inv);
    const due = Number(inv.amount_due ?? inv.total ?? 0);
    setPayAmount(String(due > 0 ? due : inv.total ?? ""));
    setPayMethod("transfer");
    setPayReference("");
  }

  const { data: bankAccounts } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => listBankAccounts(),
  });

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
        invoice_id: payInvoice.id,
        amount,
                payment_method: payMethod,
        reference: payReference || undefined,
        bank_account_id: payMethod === "transfer" ? payBankAccount || undefined : undefined,
        check_kind: payMethod === "check" ? payCheckKind : undefined,
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
        String(inv.supplier_ref || "").toLowerCase().includes(q) ||
        (partnerMap[String(inv.partner_id)] || "").toLowerCase().includes(q)
      );
    }
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compras</h1>
          <p className="mt-1 text-sm text-slate-500">
            Órdenes de compra, recepción y facturas de proveedor
          </p>
        </div>
        {tab === "orders" && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Nueva OC
          </Button>
        )}
      </div>

      <div className="mt-6 flex gap-1 rounded-lg bg-slate-100 p-1 w-full sm:w-fit overflow-x-auto">
        {(
          [
            { id: "orders" as const, label: "Órdenes de compra" },
            { id: "invoices" as const, label: "Facturas de proveedor" },
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

      <div className="mt-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder={
              tab === "orders"
                ? "Buscar por número o proveedor..."
                : "Buscar factura o proveedor..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {tab === "orders" && (
          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: "Todas" },
              { value: "draft", label: "Borrador" },
              { value: "confirmed", label: "Confirmadas" },
              { value: "partial", label: "Parciales" },
              { value: "received", label: "Recibidas" },
              /* canceladas ocultas */
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
              icon={Truck}
              title="No hay órdenes de compra"
              description={
                statusFilter || search
                  ? "Ningún resultado con esos filtros."
                  : "Creá una OC para pedir mercadería a un proveedor."
              }
              actionLabel={!statusFilter && !search ? "Nueva OC" : undefined}
              onAction={!statusFilter && !search ? () => setShowForm(true) : undefined}
            />
          )}

          <div className="space-y-2">
            {orderItems.map((o: Record<string, unknown>) => {
              const id = String(o.id);
              const isOpen = expandedId === id;
              const st = String(o.status);
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
                              <th className="px-3 py-2 text-right">Pedida</th>
                              <th className="px-3 py-2 text-right">Recibida</th>
                              <th className="px-3 py-2 text-right hidden sm:table-cell">
                                Pendiente
                              </th>
                              <th className="px-3 py-2 text-right">Precio</th>
                              <th className="px-3 py-2 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {((detail.lines as Record<string, unknown>[]) || []).map(
                              (ln) => {
                                const pending = Number(
                                  ln.qty_pending ??
                                    Number(ln.quantity) - Number(ln.qty_received)
                                );
                                return (
                                  <tr key={String(ln.id)}>
                                    <td className="px-3 py-2">
                                      {String(
                                        ln.description || ln.product_id
                                      ).slice(0, 40)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                      {Number(ln.quantity)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                      {Number(ln.qty_received)}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">
                                      {pending}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                      {formatCurrency(Number(ln.unit_price))}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                                      {formatCurrency(Number(ln.subtotal))}
                                    </td>
                                  </tr>
                                );
                              }
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-200 bg-slate-50">
                              <td
                                colSpan={5}
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
                        {(st === "confirmed" || st === "partial") && (
                          <>
                            <Button size="sm" onClick={openReceive}>
                              <PackageCheck className="h-4 w-4" /> Recibir
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={actionMut.isPending}
                              onClick={() =>
                                actionMut.mutate({ action: "invoice", id })
                              }
                            >
                              <FileText className="h-4 w-4" /> Factura proveedor
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
                        {st === "received" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={actionMut.isPending}
                            onClick={() =>
                              actionMut.mutate({ action: "invoice", id })
                            }
                          >
                            <FileText className="h-4 w-4" /> Factura proveedor
                          </Button>
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
              title="No hay facturas de proveedor"
              description="Se generan desde órdenes de compra confirmadas o recibidas."
            />
          )}

          {!invLoading && invoiceItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Número</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Proveedor</th>
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
                      const canPost = st === "draft";
                      return (
                        <tr key={String(inv.id)} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <div className="font-mono text-sm font-semibold">
                              {String(inv.invoice_number)}
                            </div>
                            {inv.supplier_ref ? (
                              <div className="text-xs text-slate-400">
                                Ref: {String(inv.supplier_ref)}
                              </div>
                            ) : null}
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
                            <div className="flex justify-end gap-1">
                              {canPost && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  loading={actionMut.isPending}
                                  onClick={() =>
                                    actionMut.mutate({
                                      action: "post",
                                      id: String(inv.id),
                                    })
                                  }
                                >
                                  <BookOpen className="h-3.5 w-3.5" /> Contabilizar
                                </Button>
                              )}
                              {canPay && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openPay(inv)}
                                >
                                  <CreditCard className="h-3.5 w-3.5" /> Pagar
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

      {/* Modal: nueva OC */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title="Nueva orden de compra"
        description="Proveedor, almacén de recepción y líneas"
        size="xl"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Proveedor *"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            options={[
              { value: "", label: "Seleccionar proveedor..." },
              ...(suppliers?.items || []).map((c: Record<string, unknown>) => ({
                value: String(c.id),
                label: String(c.name),
              })),
            ]}
            hint={
              !suppliers?.items?.length
                ? "No hay proveedores. Creá uno en Clientes."
                : undefined
            }
          />
          <Select
            label="Almacén de recepción"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            options={[
              { value: "", label: "Principal / default" },
              ...warehouseList.map((w: Record<string, unknown>) => ({
                value: String(w.id),
                label: String(w.name) + (w.is_main ? " (principal)" : ""),
              })),
            ]}
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
                  <th className="px-3 py-2 text-right w-24">Costo</th>
                  <th className="px-3 py-2 text-right w-20 hidden sm:table-cell">
                    IVA %
                  </th>
                  <th className="px-3 py-2 text-right w-28">Subtotal</th>
                  <th className="px-3 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const st = l.quantity * l.unit_price * (1 + l.tax_rate / 100);
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
                          value={l.tax_rate}
                          onChange={(e) =>
                            updateLine(l.product_id, {
                              tax_rate: parseFloat(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(st)}
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
            Crear orden de compra
          </Button>
        </div>
      </Modal>

      {/* Modal: recepción */}
      <Modal
        open={showReceive && !!detail}
        onClose={() => setShowReceive(false)}
        title="Recibir mercadería"
        description={
          detail
            ? `OC ${String(detail.order_number)} · ingresá las cantidades recibidas`
            : undefined
        }
        size="lg"
      >
        {detail && (
          <>
            <Select
              label="Almacén destino"
              value={receiveWarehouseId}
              onChange={(e) => setReceiveWarehouseId(e.target.value)}
              options={[
                { value: "", label: "Default de la OC" },
                ...warehouseList.map((w: Record<string, unknown>) => ({
                  value: String(w.id),
                  label: String(w.name) + (w.is_main ? " (principal)" : ""),
                })),
              ]}
            />
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Pendiente</th>
                    <th className="px-3 py-2 text-right w-28">A recibir</th>
                  </tr>
                </thead>
                <tbody>
                  {((detail.lines as Record<string, unknown>[]) || [])
                    .filter((ln) => {
                      const pending = Number(
                        ln.qty_pending ??
                          Number(ln.quantity) - Number(ln.qty_received)
                      );
                      return pending > 0;
                    })
                    .map((ln) => {
                      const lineId = String(ln.id);
                      const pending = Number(
                        ln.qty_pending ??
                          Number(ln.quantity) - Number(ln.qty_received)
                      );
                      return (
                        <tr key={lineId} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            {String(ln.description || ln.product_id).slice(0, 40)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {pending}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              max={pending}
                              step="any"
                              className="input py-1 text-right"
                              value={receiveQty[lineId] ?? 0}
                              onChange={(e) =>
                                setReceiveQty({
                                  ...receiveQty,
                                  [lineId]: Math.min(
                                    pending,
                                    parseFloat(e.target.value) || 0
                                  ),
                                })
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowReceive(false)}
              >
                Cancelar
              </Button>
              <Button loading={actionMut.isPending} onClick={handleReceive}>
                <PackageCheck className="h-4 w-4" /> Confirmar recepción
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Modal: pago a proveedor */}
      <Modal
        open={!!payInvoice}
        onClose={() => setPayInvoice(null)}
        title="Registrar pago a proveedor"
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
              { value: "transfer", label: "Transferencia bancaria" },
              { value: "cash", label: "Efectivo" },
              { value: "check", label: "Cheque" },
              { value: "card", label: "Tarjeta" },
              { value: "other", label: "Otro" },
            ]}
          />
          {payMethod === "transfer" && (
            <Select
              label="Cuenta bancaria *"
              value={payBankAccount}
              onChange={(e) => setPayBankAccount(e.target.value)}
              options={(Array.isArray(bankAccounts) ? bankAccounts : (bankAccounts as { items?: unknown[] })?.items || []).map(
                (a: Record<string, unknown>) => ({
                  value: String(a.id),
                  label: `${a.name}${a.bank_name ? ` (${a.bank_name})` : ""} · saldo ${a.current_balance ?? 0}`,
                })
              )}
              placeholder="Seleccionar cuenta"
            />
          )}
          {payMethod === "check" && (
            <>
              <Select
                label="Tipo de cheque"
                value={payCheckKind}
                onChange={(e) => setPayCheckKind(e.target.value)}
                options={[
                  { value: "own", label: "Propio" },
                  { value: "third_party", label: "De terceros" },
                ]}
              />
              <Input label="N° de cheque *" value={payCheckNumber} onChange={(e) => setPayCheckNumber(e.target.value)} />
              <Input label="Banco" value={payCheckBank} onChange={(e) => setPayCheckBank(e.target.value)} />
              <Input label="Vencimiento" type="date" value={payCheckDue} onChange={(e) => setPayCheckDue(e.target.value)} />
            </>
          )}
          <Input
            label="Referencia"
            value={payReference}
            onChange={(e) => setPayReference(e.target.value)}
            placeholder="N° de operación, cheque..."
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
              <CreditCard className="h-4 w-4" /> Registrar pago
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
        title="Cancelar orden de compra"
        description="La OC quedará cancelada. No se podrá recibir mercadería ni generar factura."
        confirmLabel="Cancelar OC"
        loading={actionMut.isPending}
      />
    </AppShell>
  );
}
