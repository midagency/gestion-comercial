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
import {
  getStockSummary,
  listStockLevels,
  listStockMoves,
  createStockMove,
  updateStockThresholds,
  listWarehouses,
  listProducts,
} from "@/lib/api";
import { formatDate } from "@/lib/utils";
import {
  AlertTriangle,
  Package,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Settings2,
  History,
  Search,
  Warehouse,
} from "lucide-react";

const moveTypeLabel: Record<string, string> = {
  in: "Entrada",
  out: "Salida",
  transfer: "Transferencia",
  adjustment: "Ajuste",
};

const moveTypeBadge: Record<string, "success" | "danger" | "info" | "warning"> = {
  in: "success",
  out: "danger",
  transfer: "info",
  adjustment: "warning",
};

type TabId = "levels" | "moves" | "alerts";

export default function InventoryPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState<TabId>("levels");
  const [showMoveForm, setShowMoveForm] = useState(false);
  const [editLevel, setEditLevel] = useState<Record<string, unknown> | null>(null);
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [search, setSearch] = useState("");
  const [moveTypeFilter, setMoveTypeFilter] = useState("");

  // Move form
  const [moveType, setMoveType] = useState("in");
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouseToId, setWarehouseToId] = useState("");
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");

  const { data: summary } = useQuery({
    queryKey: ["stock-summary"],
    queryFn: getStockSummary,
  });

  const { data: levels, isLoading: levelsLoading } = useQuery({
    queryKey: ["stock-levels", warehouseFilter, search, tab],
    queryFn: () =>
      listStockLevels({
        page_size: 100,
        warehouse_id: warehouseFilter || undefined,
        search: search || undefined,
        low_stock_only: tab === "alerts" ? true : undefined,
      }),
    enabled: tab === "levels" || tab === "alerts",
  });

  const { data: moves, isLoading: movesLoading } = useQuery({
    queryKey: ["stock-moves", warehouseFilter, moveTypeFilter],
    queryFn: () =>
      listStockMoves({
        page_size: 50,
        warehouse_id: warehouseFilter || undefined,
        move_type: moveTypeFilter || undefined,
      }),
    enabled: tab === "moves",
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: listWarehouses,
  });

  const { data: products } = useQuery({
    queryKey: ["products-inv", productSearch],
    queryFn: () =>
      listProducts({
        search: productSearch || undefined,
        page_size: 40,
      }),
  });

  // Map for product names in levels/moves (fetch a broader list once)
  const { data: allProducts } = useQuery({
    queryKey: ["products-inv-map"],
    queryFn: () => listProducts({ page_size: 100 }),
  });

  const productMap = useMemo(() => {
    const map: Record<string, { name: string; sku?: string }> = {};
    const src = allProducts?.items || products?.items || [];
    src.forEach((p: Record<string, unknown>) => {
      map[String(p.id)] = {
        name: String(p.name),
        sku: p.sku ? String(p.sku) : undefined,
      };
    });
    products?.items?.forEach((p: Record<string, unknown>) => {
      map[String(p.id)] = {
        name: String(p.name),
        sku: p.sku ? String(p.sku) : undefined,
      };
    });
    return map;
  }, [allProducts, products]);

  const warehouseMap = useMemo(() => {
    const map: Record<string, string> = {};
    (warehouses || []).forEach((w: Record<string, unknown>) => {
      map[String(w.id)] = String(w.name);
    });
    return map;
  }, [warehouses]);

  const createMut = useMutation({
    mutationFn: createStockMove,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      qc.invalidateQueries({ queryKey: ["stock-moves"] });
      qc.invalidateQueries({ queryKey: ["stock-summary"] });
      success("Movimiento registrado");
      closeMoveForm();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Error al registrar el movimiento";
      toastError("Error", String(msg));
    },
  });

  const thresholdMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: unknown }) =>
      updateStockThresholds(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-levels"] });
      qc.invalidateQueries({ queryKey: ["stock-summary"] });
      success("Umbrales actualizados");
      setEditLevel(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Error al actualizar umbrales";
      toastError("Error", String(msg));
    },
  });

  function resetMoveForm() {
    setMoveType("in");
    setWarehouseId("");
    setWarehouseToId("");
    setProductId("");
    setProductSearch("");
    setQuantity("1");
    setNotes("");
  }

  function openMoveForm() {
    resetMoveForm();
    if (warehouses?.[0]) setWarehouseId(String(warehouses[0].id));
    setShowMoveForm(true);
  }

  function closeMoveForm() {
    setShowMoveForm(false);
    resetMoveForm();
  }

  function openThresholds(lv: Record<string, unknown>) {
    setEditLevel(lv);
    setMinQty(String(lv.min_qty ?? 0));
    setMaxQty(lv.max_qty != null ? String(lv.max_qty) : "");
  }

  function submitMove() {
    if (!warehouseId || !productId) {
      toastError("Seleccioná almacén y producto");
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || (moveType !== "adjustment" && qty <= 0)) {
      toastError("Cantidad inválida");
      return;
    }
    if (moveType === "transfer" && !warehouseToId) {
      toastError("Indicá el almacén destino");
      return;
    }
    if (moveType === "transfer" && warehouseToId === warehouseId) {
      toastError("Origen y destino deben ser distintos");
      return;
    }
    createMut.mutate({
      warehouse_id: warehouseId,
      product_id: productId,
      move_type: moveType,
      quantity: qty,
      warehouse_to_id: moveType === "transfer" ? warehouseToId : undefined,
      notes: notes || undefined,
      reference_type: "manual",
    });
  }

  function submitThresholds() {
    if (!editLevel) return;
    const min = parseFloat(minQty);
    const max = maxQty === "" ? null : parseFloat(maxQty);
    if (isNaN(min) || min < 0) {
      toastError("Mínimo inválido");
      return;
    }
    if (max != null && (isNaN(max) || max < min)) {
      toastError("El máximo debe ser ≥ mínimo");
      return;
    }
    thresholdMut.mutate({
      id: String(editLevel.id),
      payload: { min_qty: min, max_qty: max },
    });
  }

  function productLabel(id: unknown) {
    const p = productMap[String(id)];
    if (!p) return String(id).slice(0, 8) + "…";
    return p.sku ? `${p.name} (${p.sku})` : p.name;
  }

  const levelItems = levels?.items ?? [];
  const moveItems = moves?.items ?? [];
  const warehouseList = warehouses || [];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Inventario</h1>
          <p className="mt-1 text-sm text-slate-500">Stock, movimientos y alertas</p>
        </div>
        <Button onClick={openMoveForm}>
          <Plus className="h-4 w-4" /> Nuevo movimiento
        </Button>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Con control de stock</p>
                <p className="text-xl font-bold text-slate-900">
                  {summary.total_products_tracked}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
                <Warehouse className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Almacenes</p>
                <p className="text-xl font-bold text-slate-900">
                  {summary.total_warehouses}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Stock bajo</p>
                <p className="text-xl font-bold text-slate-900">
                  {summary.low_stock_count}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2.5 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Sin stock</p>
                <p className="text-xl font-bold text-slate-900">
                  {summary.zero_stock_count}
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
            { id: "levels" as const, label: "Niveles", icon: Package },
            { id: "moves" as const, label: "Movimientos", icon: History },
            { id: "alerts" as const, label: "Alertas", icon: AlertTriangle },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 sm:px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.id === "alerts" && summary?.low_stock_count > 0 && (
              <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                {summary.low_stock_count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {(tab === "levels" || tab === "alerts") && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Buscar producto por nombre o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
        {warehouseList.length > 0 && (
          <Select
            className="sm:w-48"
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            options={[
              { value: "", label: "Todos los almacenes" },
              ...warehouseList.map((w: Record<string, unknown>) => ({
                value: String(w.id),
                label: String(w.name) + (w.is_main ? " (principal)" : ""),
              })),
            ]}
          />
        )}
        {tab === "moves" && (
          <Select
            className="sm:w-44"
            value={moveTypeFilter}
            onChange={(e) => setMoveTypeFilter(e.target.value)}
            options={[
              { value: "", label: "Todos los tipos" },
              { value: "in", label: "Entrada" },
              { value: "out", label: "Salida" },
              { value: "transfer", label: "Transferencia" },
              { value: "adjustment", label: "Ajuste" },
            ]}
          />
        )}
      </div>

      {/* LEVELS / ALERTS */}
      {(tab === "levels" || tab === "alerts") && (
        <div className="mt-4">
          {levelsLoading && <PageLoader />}

          {!levelsLoading && levelItems.length === 0 && (
            <EmptyState
              icon={tab === "alerts" ? AlertTriangle : Package}
              title={
                tab === "alerts"
                  ? "Sin alertas de stock"
                  : search || warehouseFilter
                  ? "Sin resultados"
                  : "Sin niveles de stock"
              }
              description={
                tab === "alerts"
                  ? "Ningún producto está por debajo del mínimo configurado."
                  : "Registrá una entrada de stock para empezar a controlar inventario."
              }
              actionLabel={tab === "levels" && !search ? "Nuevo movimiento" : undefined}
              onAction={tab === "levels" && !search ? openMoveForm : undefined}
            />
          )}

          {!levelsLoading && levelItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Almacén</th>
                      <th className="px-4 py-3 text-right">Cantidad</th>
                      <th className="px-4 py-3 text-right hidden md:table-cell">
                        Reservado
                      </th>
                      <th className="px-4 py-3 text-right">Disponible</th>
                      <th className="px-4 py-3 text-right hidden lg:table-cell">
                        Mín / Máx
                      </th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {levelItems.map((lv: Record<string, unknown>) => {
                      const qty = Number(lv.quantity);
                      const available = Number(lv.available_qty);
                      const status =
                        qty <= 0 ? "empty" : lv.is_low_stock ? "low" : "ok";
                      return (
                        <tr key={String(lv.id)} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {productLabel(lv.product_id)}
                            </div>
                            <div className="text-xs text-slate-400 sm:hidden">
                              {warehouseMap[String(lv.warehouse_id)] || "—"}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                            {warehouseMap[String(lv.warehouse_id)] || "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {qty}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500 tabular-nums hidden md:table-cell">
                            {Number(lv.reserved_qty)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {available}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500 tabular-nums hidden lg:table-cell">
                            {Number(lv.min_qty)}
                            {lv.max_qty != null ? ` / ${Number(lv.max_qty)}` : ""}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                status === "empty"
                                  ? "danger"
                                  : status === "low"
                                  ? "warning"
                                  : "success"
                              }
                            >
                              {status === "empty"
                                ? "Sin stock"
                                : status === "low"
                                ? "Bajo"
                                : "OK"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openThresholds(lv)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                                title="Umbrales min/max"
                              >
                                <Settings2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMoveType("in");
                                  setWarehouseId(String(lv.warehouse_id));
                                  setProductId(String(lv.product_id));
                                  setProductSearch(
                                    productMap[String(lv.product_id)]?.name || ""
                                  );
                                  setQuantity("1");
                                  setShowMoveForm(true);
                                }}
                                className="rounded-lg p-2 text-slate-400 hover:bg-green-50 hover:text-green-600"
                                title="Entrada rápida"
                              >
                                <ArrowDownToLine className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMoveType("out");
                                  setWarehouseId(String(lv.warehouse_id));
                                  setProductId(String(lv.product_id));
                                  setProductSearch(
                                    productMap[String(lv.product_id)]?.name || ""
                                  );
                                  setQuantity("1");
                                  setShowMoveForm(true);
                                }}
                                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Salida rápida"
                              >
                                <ArrowUpFromLine className="h-4 w-4" />
                              </button>
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

      {/* MOVES */}
      {tab === "moves" && (
        <div className="mt-4">
          {movesLoading && <PageLoader />}

          {!movesLoading && moveItems.length === 0 && (
            <EmptyState
              icon={History}
              title="Sin movimientos"
              description="Los ingresos, egresos, transferencias y ajustes aparecerán aquí."
              actionLabel="Nuevo movimiento"
              onAction={openMoveForm}
            />
          )}

          {!movesLoading && moveItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Producto</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Almacén</th>
                      <th className="px-4 py-3 text-right">Cantidad</th>
                      <th className="px-4 py-3 hidden md:table-cell">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {moveItems.map((m: Record<string, unknown>) => (
                      <tr key={String(m.id)} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {m.created_at
                            ? formatDate(String(m.created_at))
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              moveTypeBadge[String(m.move_type)] || "default"
                            }
                          >
                            {moveTypeLabel[String(m.move_type)] ||
                              String(m.move_type)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {productLabel(m.product_id)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                          {warehouseMap[String(m.warehouse_id)] || "—"}
                          {m.warehouse_to_id ? (
                            <span className="text-slate-400">
                              {" "}
                              → {warehouseMap[String(m.warehouse_to_id)] || "…"}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {Number(m.quantity)}
                        </td>
                        <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate hidden md:table-cell">
                          {String(m.notes || "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: nuevo movimiento */}
      <Modal
        open={showMoveForm}
        onClose={closeMoveForm}
        title="Nuevo movimiento de stock"
        description="Entrada, salida, transferencia o ajuste"
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo de movimiento *"
            value={moveType}
            onChange={(e) => setMoveType(e.target.value)}
            options={[
              { value: "in", label: "Entrada (+)" },
              { value: "out", label: "Salida (−)" },
              { value: "transfer", label: "Transferencia" },
              { value: "adjustment", label: "Ajuste (stock final)" },
            ]}
            hint={
              moveType === "adjustment"
                ? "La cantidad es el stock final deseado"
                : moveType === "transfer"
                ? "Mueve stock de un almacén a otro"
                : moveType === "in"
                ? "Suma cantidad al stock"
                : "Resta cantidad del stock"
            }
          />

          <Select
            label={moveType === "transfer" ? "Almacén origen *" : "Almacén *"}
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            options={[
              { value: "", label: "Seleccionar..." },
              ...warehouseList.map((w: Record<string, unknown>) => ({
                value: String(w.id),
                label: String(w.name) + (w.is_main ? " (principal)" : ""),
              })),
            ]}
          />

          {moveType === "transfer" && (
            <Select
              label="Almacén destino *"
              value={warehouseToId}
              onChange={(e) => setWarehouseToId(e.target.value)}
              options={[
                { value: "", label: "Seleccionar..." },
                ...warehouseList
                  .filter((w: Record<string, unknown>) => String(w.id) !== warehouseId)
                  .map((w: Record<string, unknown>) => ({
                    value: String(w.id),
                    label: String(w.name),
                  })),
              ]}
            />
          )}

          <div className={moveType === "transfer" ? "" : "sm:col-span-1"}>
            <label className="label">Producto *</label>
            <input
              className="input mb-1.5"
              placeholder="Buscar producto..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            <select
              className="input"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Seleccionar producto...</option>
              {(products?.items || []).map((p: Record<string, unknown>) => (
                <option key={String(p.id)} value={String(p.id)}>
                  {String(p.name)}
                  {p.sku ? ` (${p.sku})` : ""}
                </option>
              ))}
            </select>
          </div>

          <Input
            label={
              moveType === "adjustment" ? "Stock final deseado *" : "Cantidad *"
            }
            type="number"
            min={0}
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />

          <Input
            label="Notas"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
            className={moveType === "transfer" ? "sm:col-span-2" : ""}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-2 justify-end">
          {moveType === "transfer" && (
            <div className="mr-auto flex items-center gap-1.5 text-xs text-slate-500">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Se generan 2 movimientos (salida + entrada)
            </div>
          )}
          <Button type="button" variant="secondary" onClick={closeMoveForm}>
            Cancelar
          </Button>
          <Button loading={createMut.isPending} onClick={submitMove}>
            Registrar movimiento
          </Button>
        </div>
      </Modal>

      {/* Modal: umbrales */}
      <Modal
        open={!!editLevel}
        onClose={() => setEditLevel(null)}
        title="Umbrales de stock"
        description={
          editLevel
            ? productLabel(editLevel.product_id) +
              " · " +
              (warehouseMap[String(editLevel.warehouse_id)] || "")
            : undefined
        }
        size="sm"
      >
        <div className="grid gap-4">
          <Input
            label="Cantidad mínima"
            type="number"
            min={0}
            step="any"
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            hint="Se alerta cuando el stock llega a este valor o menos"
          />
          <Input
            label="Cantidad máxima (opcional)"
            type="number"
            min={0}
            step="any"
            value={maxQty}
            onChange={(e) => setMaxQty(e.target.value)}
            hint="Dejá vacío si no aplica"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditLevel(null)}>
              Cancelar
            </Button>
            <Button loading={thresholdMut.isPending} onClick={submitThresholds}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
