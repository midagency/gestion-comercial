"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import {
  searchPosProducts,
  createPosSale,
  listRegisters,
  openCashSession,
  listPartners,
  listWarehouses,
  openPrintDocument,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  Search,
  Plus,
  Trash2,
  ShoppingBag,
  Minus,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  CheckCircle2,
  Monitor,
  Printer,
  X,
} from "lucide-react";

interface CartLine {
  product_id: string;
  name: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  stock_available?: number | null;
}

type PayMethod = "cash" | "card" | "transfer" | "other";

export default function POSPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [registerName, setRegisterName] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [partnerId, setPartnerId] = useState("");

  // Payments
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payCard, setPayCard] = useState("");
  const [useSplit, setUseSplit] = useState(false);

  // Session open modal
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [selectedRegisterId, setSelectedRegisterId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("0");

  // Success result
  const [lastSale, setLastSale] = useState<Record<string, unknown> | null>(null);

  const { data: products, isFetching: searching } = useQuery({
    queryKey: ["pos-products", q, warehouseId],
    queryFn: () => searchPosProducts(q || undefined, warehouseId || undefined),
  });

  const { data: registers, isLoading: regLoading } = useQuery({
    queryKey: ["registers"],
    queryFn: listRegisters,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: listWarehouses,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-pos"],
    queryFn: () => listPartners({ partner_type: "customer", page_size: 100 }),
  });

  // Auto-attach existing open session
  useEffect(() => {
    if (sessionId || !registers?.length) return;
    const open = registers.find(
      (r: Record<string, unknown>) => r.open_session_id
    );
    if (open) {
      setSessionId(String(open.open_session_id));
      setRegisterName(String(open.name));
    }
  }, [registers, sessionId]);

  const openSessionMut = useMutation({
    mutationFn: openCashSession,
    onSuccess: (data: Record<string, unknown>) => {
      setSessionId(String(data.id));
      const reg = (registers || []).find(
        (r: Record<string, unknown>) => String(r.id) === selectedRegisterId
      );
      setRegisterName(reg ? String(reg.name) : "Caja");
      qc.invalidateQueries({ queryKey: ["registers"] });
      success("Sesión de caja abierta");
      setShowOpenSession(false);
      searchRef.current?.focus();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "No se pudo abrir la caja";
      toastError("Error", String(msg));
    },
  });

  const saleMut = useMutation({
    mutationFn: createPosSale,
    onSuccess: (data: Record<string, unknown>) => {
      setLastSale(data);
      setCart([]);
      setPayAmount("");
      setPayCard("");
      setUseSplit(false);
      setPartnerId("");
      success("Venta registrada");
      qc.invalidateQueries({ queryKey: ["pos-products"] });
      searchRef.current?.focus();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Error al registrar la venta";
      toastError("Error", String(msg));
    },
  });

  function addToCart(p: Record<string, unknown>) {
    const id = String(p.id);
    const existing = cart.find((c) => c.product_id === id);
    if (existing) {
      setCart(
        cart.map((c) =>
          c.product_id === id ? { ...c, quantity: c.quantity + 1 } : c
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product_id: id,
          name: String(p.name),
          sku: p.sku ? String(p.sku) : undefined,
          quantity: 1,
          unit_price: Number(p.unit_price || 0),
          tax_rate: 21,
          stock_available:
            p.stock_available != null ? Number(p.stock_available) : null,
        },
      ]);
    }
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart(cart.filter((c) => c.product_id !== productId));
      return;
    }
    setCart(
      cart.map((c) => (c.product_id === productId ? { ...c, quantity: qty } : c))
    );
  }

  function setPrice(productId: string, price: number) {
    setCart(
      cart.map((c) =>
        c.product_id === productId ? { ...c, unit_price: Math.max(0, price) } : c
      )
    );
  }

  const subtotal = cart.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const tax = cart.reduce(
    (s, l) => s + l.quantity * l.unit_price * (l.tax_rate / 100),
    0
  );
  const total = subtotal + tax;

  const change = useMemo(() => {
    if (payMethod !== "cash" || useSplit) return 0;
    const paid = parseFloat(payAmount);
    if (isNaN(paid) || paid <= total) return 0;
    return paid - total;
  }, [payAmount, payMethod, total, useSplit]);

  function buildPayments() {
    if (useSplit) {
      const cash = parseFloat(payAmount) || 0;
      const card = parseFloat(payCard) || 0;
      const payments: { payment_method: string; amount: number }[] = [];
      if (cash > 0) payments.push({ payment_method: "cash", amount: cash });
      if (card > 0) payments.push({ payment_method: "card", amount: card });
      return payments;
    }
    const amount =
      payMethod === "cash"
        ? parseFloat(payAmount) || total
        : total;
    return [{ payment_method: payMethod, amount: amount > 0 ? amount : total }];
  }

  function checkout() {
    if (!sessionId) {
      toastError("Abrí una sesión de caja primero");
      setShowOpenSession(true);
      return;
    }
    if (cart.length === 0) {
      toastError("El carrito está vacío");
      return;
    }
    const payments = buildPayments();
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    if (paid + 0.001 < total && payMethod !== "cash") {
      toastError("El pago no cubre el total");
      return;
    }
    if (useSplit && paid + 0.001 < total) {
      toastError(`Falta ${formatCurrency(total - paid)} para cubrir el total`);
      return;
    }
    saleMut.mutate({
      session_id: sessionId,
      partner_id: partnerId || undefined,
      warehouse_id: warehouseId || undefined,
      lines: cart.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_rate: l.tax_rate,
      })),
      payments,
    });
  }

  function attachExistingSession() {
    const open = (registers || []).find(
      (r: Record<string, unknown>) => r.open_session_id
    );
    if (open) {
      setSessionId(String(open.open_session_id));
      setRegisterName(String(open.name));
      success(`Usando sesión de ${open.name}`);
      searchRef.current?.focus();
    } else {
      setShowOpenSession(true);
      if (registers?.[0]) setSelectedRegisterId(String(registers[0].id));
    }
  }

  function openNewSession() {
    if (!selectedRegisterId) {
      toastError("Seleccioná una caja");
      return;
    }
    openSessionMut.mutate({
      register_id: selectedRegisterId,
      opening_amount: parseFloat(openingAmount) || 0,
    });
  }

  const productItems = products?.items || [];
  const hasOpenRegister = (registers || []).some(
    (r: Record<string, unknown>) => r.open_session_id
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Punto de Venta</h1>
          <p className="mt-1 text-sm text-slate-500 flex items-center gap-2 flex-wrap">
            {sessionId ? (
              <>
                <Badge variant="success">Sesión activa</Badge>
                <span>{registerName || "Caja"}</span>
              </>
            ) : (
              <>
                <Badge variant="warning">Sin sesión</Badge>
                <span>Abrí o conectá una caja para vender</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!sessionId && (
            <>
              {hasOpenRegister && (
                <Button variant="secondary" onClick={attachExistingSession}>
                  Usar sesión abierta
                </Button>
              )}
              <Button
                onClick={() => {
                  setShowOpenSession(true);
                  if (registers?.[0])
                    setSelectedRegisterId(String(registers[0].id));
                }}
                loading={regLoading}
              >
                <Monitor className="h-4 w-4" /> Abrir caja
              </Button>
            </>
          )}
          {sessionId && cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCart([]);
                setPayAmount("");
                setPayCard("");
              }}
            >
              Vaciar carrito
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {(warehouses || []).length > 0 && (
          <Select
            className="sm:w-48"
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            options={[
              { value: "", label: "Almacén default" },
              ...(warehouses || []).map((w: Record<string, unknown>) => ({
                value: String(w.id),
                label: String(w.name),
              })),
            ]}
          />
        )}
        <Select
          className="sm:w-56"
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          options={[
            { value: "", label: "Consumidor final" },
            ...(customers?.items || []).map((c: Record<string, unknown>) => ({
              value: String(c.id),
              label: String(c.name),
            })),
          ]}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Products */}
        <div className="lg:col-span-3 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              className="input pl-10 text-base py-2.5"
              placeholder="Buscar por nombre, SKU o código de barras..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && productItems.length === 1) {
                  e.preventDefault();
                  addToCart(productItems[0]);
                  setQ("");
                }
              }}
            />
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                Buscando…
              </span>
            )}
          </div>

          {productItems.length === 0 && (
            <EmptyState
              icon={Search}
              title={q ? "Sin resultados" : "Buscá un producto"}
              description={
                q
                  ? "Probá con otro nombre, SKU o código."
                  : "Escribí en el buscador o escaneá un código de barras."
              }
            />
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {productItems.map((p: Record<string, unknown>) => {
              const stock =
                p.stock_available != null ? Number(p.stock_available) : null;
              const lowStock = stock != null && stock <= 0;
              return (
                <button
                  key={String(p.id)}
                  type="button"
                  onClick={() => addToCart(p)}
                  disabled={lowStock && Boolean(p.track_stock)}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-brand-300 hover:bg-brand-50 transition-colors disabled:opacity-50 disabled:hover:bg-white disabled:hover:border-slate-200"
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-medium text-slate-900 text-sm truncate">
                      {String(p.name)}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {p.sku ? String(p.sku) : ""}
                      {stock != null ? ` · Stock: ${stock}` : ""}
                    </p>
                    {lowStock && p.track_stock ? (
                      <Badge variant="danger" className="mt-1">
                        Sin stock
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-brand-700">
                      {formatCurrency(Number(p.unit_price || 0))}
                    </p>
                    <Plus className="h-4 w-4 text-slate-400 ml-auto mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <div className="card p-5 sticky top-4">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingBag className="h-5 w-5 text-brand-600" />
              <h3 className="text-lg font-semibold text-slate-900">Carrito</h3>
              {cart.length > 0 && (
                <Badge variant="brand">{cart.length}</Badge>
              )}
            </div>

            {cart.length === 0 ? (
              <p className="text-sm text-slate-400 py-10 text-center">
                Agregá productos al carrito
              </p>
            ) : (
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {cart.map((l) => (
                  <div
                    key={l.product_id}
                    className="flex gap-2 items-start border-b border-slate-100 pb-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-900 truncate">
                        {l.name}
                      </p>
                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          className="rounded border border-slate-200 p-1 hover:bg-slate-50"
                          onClick={() => setQty(l.product_id, l.quantity - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0.01}
                          step="any"
                          className="w-14 input py-1 text-center text-sm"
                          value={l.quantity}
                          onChange={(e) =>
                            setQty(
                              l.product_id,
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                        <button
                          type="button"
                          className="rounded border border-slate-200 p-1 hover:bg-slate-50"
                          onClick={() => setQty(l.product_id, l.quantity + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        <span className="text-xs text-slate-400 mx-1">×</span>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="w-20 input py-1 text-right text-sm"
                          value={l.unit_price}
                          onChange={(e) =>
                            setPrice(
                              l.product_id,
                              parseFloat(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatCurrency(l.quantity * l.unit_price * (1 + l.tax_rate / 100))}
                      </p>
                      <button
                        type="button"
                        className="mt-1 rounded p-1 text-slate-400 hover:text-red-500"
                        onClick={() =>
                          setCart(cart.filter((c) => c.product_id !== l.product_id))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>IVA</span>
                <span className="tabular-nums">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-slate-900 pt-1">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Payment */}
            <div className="mt-4 space-y-3">
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    { id: "cash" as const, label: "Efectivo", icon: Banknote },
                    { id: "card" as const, label: "Tarjeta", icon: CreditCard },
                    {
                      id: "transfer" as const,
                      label: "Transf.",
                      icon: ArrowLeftRight,
                    },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setPayMethod(m.id);
                      setUseSplit(false);
                      if (m.id !== "cash") setPayAmount("");
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors ${
                      payMethod === m.id && !useSplit
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600"
                    }`}
                  >
                    <m.icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={useSplit}
                  onChange={(e) => setUseSplit(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                Pago mixto (efectivo + tarjeta)
              </label>

              {useSplit ? (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Efectivo"
                    type="number"
                    min={0}
                    step="any"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0"
                  />
                  <Input
                    label="Tarjeta"
                    type="number"
                    min={0}
                    step="any"
                    value={payCard}
                    onChange={(e) => setPayCard(e.target.value)}
                    placeholder="0"
                  />
                </div>
              ) : payMethod === "cash" ? (
                <div>
                  <label className="label">Monto recibido</label>
                  <input
                    className="input text-lg font-semibold"
                    type="number"
                    min={0}
                    step="any"
                    placeholder={total.toFixed(2)}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") checkout();
                    }}
                  />
                  {change > 0 && (
                    <p className="mt-1.5 text-sm font-semibold text-green-700">
                      Vuelto: {formatCurrency(change)}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500]
                      .filter((v, i, a) => a.indexOf(v) === i && v > 0)
                      .map((v) => (
                        <button
                          key={v}
                          type="button"
                          className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          onClick={() => setPayAmount(String(v))}
                        >
                          {formatCurrency(v)}
                        </button>
                      ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Se cobrará el total completo con{" "}
                  {payMethod === "card" ? "tarjeta" : "transferencia"}.
                </p>
              )}
            </div>

            <Button
              className="w-full mt-4"
              size="lg"
              disabled={cart.length === 0 || !sessionId || saleMut.isPending}
              loading={saleMut.isPending}
              onClick={checkout}
            >
              Cobrar {cart.length > 0 ? formatCurrency(total) : ""}
            </Button>

            {!sessionId && (
              <p className="mt-2 text-center text-xs text-amber-600">
                Necesitás una sesión de caja abierta
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Modal: abrir sesión */}
      <Modal
        open={showOpenSession}
        onClose={() => setShowOpenSession(false)}
        title="Abrir sesión de caja"
        description="Elegí la caja y el monto de apertura"
        size="sm"
      >
        <div className="grid gap-4">
          <Select
            label="Caja *"
            value={selectedRegisterId}
            onChange={(e) => setSelectedRegisterId(e.target.value)}
            options={[
              { value: "", label: "Seleccionar..." },
              ...(registers || []).map((r: Record<string, unknown>) => ({
                value: String(r.id),
                label:
                  String(r.name) +
                  (r.open_session_id ? " (ya abierta)" : ""),
              })),
            ]}
          />
          <Input
            label="Monto de apertura"
            type="number"
            min={0}
            step="any"
            value={openingAmount}
            onChange={(e) => setOpeningAmount(e.target.value)}
            hint="Efectivo con el que arranca la caja"
          />
          {hasOpenRegister && (
            <Button
              variant="secondary"
              onClick={() => {
                setShowOpenSession(false);
                attachExistingSession();
              }}
            >
              Usar sesión ya abierta
            </Button>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowOpenSession(false)}
            >
              Cancelar
            </Button>
            <Button
              loading={openSessionMut.isPending}
              onClick={openNewSession}
              disabled={!selectedRegisterId}
            >
              Abrir caja
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: venta exitosa */}
      <Modal
        open={!!lastSale}
        onClose={() => setLastSale(null)}
        title="Venta registrada"
        size="sm"
      >
        {lastSale && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-3 text-green-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm text-slate-500">
                {String(lastSale.message || "Venta OK")}
              </p>
              <p className="font-mono text-sm font-semibold">
                {String(lastSale.invoice_number || lastSale.order_number || "")}
              </p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                {formatCurrency(Number(lastSale.total || 0))}
              </p>
              {Number(lastSale.change) > 0 && (
                <p className="text-lg font-semibold text-green-700">
                  Vuelto: {formatCurrency(Number(lastSale.change))}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              {lastSale.invoice_id ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={async () => {
                    try {
                      await openPrintDocument(
                        "ticket",
                        String(lastSale.invoice_id)
                      );
                    } catch (e) {
                      toastError(
                        "No se pudo abrir el ticket",
                        e instanceof Error ? e.message : undefined
                      );
                    }
                  }}
                >
                  <Printer className="h-4 w-4" /> Imprimir ticket
                </Button>
              ) : null}
              {lastSale.invoice_id ? (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={async () => {
                    try {
                      await openPrintDocument(
                        "invoice",
                        String(lastSale.invoice_id)
                      );
                    } catch (e) {
                      toastError(
                        "No se pudo abrir la factura",
                        e instanceof Error ? e.message : undefined
                      );
                    }
                  }}
                >
                  <Printer className="h-4 w-4" /> Factura A4
                </Button>
              ) : null}
              <Button className="w-full" onClick={() => setLastSale(null)}>
                <X className="h-4 w-4" /> Nueva venta
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
