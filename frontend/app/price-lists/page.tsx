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
  listPriceLists,
  createPriceList,
  updatePriceList,
  deletePriceList,
  getPriceList,
  addPriceListItem,
  updatePriceListItem,
  deletePriceListItem,
  listProducts,
} from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import {
  Plus,
  Tag,
  Pencil,
  Trash2,
  Search,
  Star,
} from "lucide-react";

interface ListForm {
  name: string;
  currency_code: string;
  is_default: boolean;
}

const emptyListForm: ListForm = {
  name: "",
  currency_code: "ARS",
  is_default: false,
};

export default function PriceListsPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // List form (create/edit)
  const [showListForm, setShowListForm] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [listForm, setListForm] = useState<ListForm>(emptyListForm);
  const [deleteListId, setDeleteListId] = useState<string | null>(null);

  // Item form
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [price, setPrice] = useState("");
  const [minQty, setMinQty] = useState("1");
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  const { data: lists, isLoading } = useQuery({
    queryKey: ["price-lists"],
    queryFn: () => listPriceLists({ page_size: 50 }),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["price-list", selectedId],
    queryFn: () => getPriceList(selectedId!),
    enabled: !!selectedId,
  });

  const { data: products } = useQuery({
    queryKey: ["products-pl", productSearch],
    queryFn: () =>
      listProducts({ search: productSearch || undefined, page_size: 50 }),
  });

  const productMap = useMemo(() => {
    const map: Record<string, string> = {};
    (products?.items || []).forEach((p: Record<string, unknown>) => {
      map[String(p.id)] = String(p.name) + (p.sku ? ` (${p.sku})` : "");
    });
    return map;
  }, [products]);

  const listItems: Record<string, unknown>[] = useMemo(() => {
    const raw = lists?.items ?? lists ?? [];
    return Array.isArray(raw) ? raw : [];
  }, [lists]);

  const filteredLists = useMemo(() => {
    if (!search.trim()) return listItems;
    const q = search.toLowerCase();
    return listItems.filter((pl) =>
      String(pl.name || "").toLowerCase().includes(q)
    );
  }, [listItems, search]);

  const saveListMut = useMutation({
    mutationFn: (payload: ListForm) =>
      editingListId
        ? updatePriceList(editingListId, payload)
        : createPriceList(payload),
    onSuccess: (data: Record<string, unknown>) => {
      qc.invalidateQueries({ queryKey: ["price-lists"] });
      if (editingListId) {
        qc.invalidateQueries({ queryKey: ["price-list", editingListId] });
      }
      success(editingListId ? "Lista actualizada" : "Lista creada");
      if (!editingListId && data?.id) {
        setSelectedId(String(data.id));
      }
      closeListForm();
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "No se pudo guardar la lista";
      toastError("Error", String(msg));
    },
  });

  const deleteListMut = useMutation({
    mutationFn: (id: string) => deletePriceList(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-lists"] });
      if (selectedId === deleteListId) setSelectedId(null);
      success("Lista desactivada");
      setDeleteListId(null);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "No se pudo eliminar";
      toastError("Error", String(msg));
    },
  });

  const saveItemMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Sin lista");
      const payload = {
        product_id: productId,
        price: parseFloat(price),
        min_qty: parseFloat(minQty) || 1,
      };
      if (editingItem) {
        return updatePriceListItem(selectedId, String(editingItem.id), {
          price: payload.price,
          min_qty: payload.min_qty,
        });
      }
      return addPriceListItem(selectedId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-list", selectedId] });
      success(editingItem ? "Precio actualizado" : "Precio agregado");
      closeItemForm();
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "No se pudo guardar el precio";
      toastError("Error", String(msg));
    },
  });

  const deleteItemMut = useMutation({
    mutationFn: (itemId: string) => deletePriceListItem(selectedId!, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-list", selectedId] });
      success("Ítem eliminado");
      setDeleteItemId(null);
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "No se pudo eliminar";
      toastError("Error", String(msg));
    },
  });

  function openCreateList() {
    setEditingListId(null);
    setListForm(emptyListForm);
    setShowListForm(true);
  }

  function openEditList(pl: Record<string, unknown>) {
    setEditingListId(String(pl.id));
    setListForm({
      name: String(pl.name || ""),
      currency_code: String(pl.currency_code || "ARS"),
      is_default: Boolean(pl.is_default),
    });
    setShowListForm(true);
  }

  function closeListForm() {
    setShowListForm(false);
    setEditingListId(null);
    setListForm(emptyListForm);
  }

  function openAddItem() {
    setEditingItem(null);
    setProductId("");
    setProductSearch("");
    setPrice("");
    setMinQty("1");
    setShowItemForm(true);
  }

  function openEditItem(it: Record<string, unknown>) {
    setEditingItem(it);
    setProductId(String(it.product_id));
    setProductSearch("");
    setPrice(String(it.price ?? ""));
    setMinQty(String(it.min_qty ?? 1));
    setShowItemForm(true);
  }

  function closeItemForm() {
    setShowItemForm(false);
    setEditingItem(null);
    setProductId("");
    setPrice("");
    setMinQty("1");
  }

  const detailItems: Record<string, unknown>[] = detail?.items || [];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Listas de precios</h1>
          <p className="mt-1 text-sm text-slate-500">
            Precios por canal, cliente o volumen · {listItems.length} lista
            {listItems.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={openCreateList}>
          <Plus className="h-4 w-4" /> Nueva lista
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Left: list selector */}
        <div className="lg:col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Buscar lista..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading && <PageLoader />}

          {!isLoading && filteredLists.length === 0 && (
            <EmptyState
              icon={Tag}
              title="No hay listas"
              description={
                search
                  ? "Ninguna lista coincide con la búsqueda."
                  : "Creá una lista (ej. Minorista, Mayorista) para asignar precios."
              }
              actionLabel={search ? undefined : "Nueva lista"}
              onAction={search ? undefined : openCreateList}
            />
          )}

          <div className="space-y-2">
            {filteredLists.map((pl) => {
              const id = String(pl.id);
              const active = selectedId === id;
              return (
                <div
                  key={id}
                  className={`group flex items-start gap-2 rounded-xl border px-3 py-3 transition-colors ${
                    active
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => setSelectedId(id)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag
                        className={`h-4 w-4 shrink-0 ${
                          active ? "text-brand-600" : "text-slate-400"
                        }`}
                      />
                      <span className="font-semibold text-slate-900 truncate">
                        {String(pl.name)}
                      </span>
                      {pl.is_default ? (
                        <Badge variant="brand">
                          <Star className="h-3 w-3 mr-0.5 inline" />
                          Default
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {String(pl.currency_code || "ARS")}
                      {pl.is_active === false ? " · Inactiva" : ""}
                    </p>
                  </button>
                  <div className="flex shrink-0 opacity-70 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEditList(pl)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-brand-600"
                      title="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteListId(id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Eliminar"
                      disabled={Boolean(pl.is_default)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: detail + items */}
        <div className="lg:col-span-3">
          {!selectedId && (
            <EmptyState
              icon={Tag}
              title="Seleccioná una lista"
              description="Elegí una lista a la izquierda para ver y editar sus precios."
            />
          )}

          {selectedId && detailLoading && <PageLoader />}

          {selectedId && detail && !detailLoading && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 px-4 py-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {String(detail.name)}
                    </h2>
                    {detail.is_default ? (
                      <Badge variant="brand">Por defecto</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Moneda: {String(detail.currency_code)} ·{" "}
                    {detailItems.length} producto
                    {detailItems.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEditList(detail)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar lista
                  </Button>
                  <Button size="sm" onClick={openAddItem}>
                    <Plus className="h-3.5 w-3.5" /> Agregar precio
                  </Button>
                </div>
              </div>

              {detailItems.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Tag}
                    title="Sin precios cargados"
                    description="Agregá productos con su precio para esta lista."
                    actionLabel="Agregar precio"
                    onAction={openAddItem}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Producto</th>
                        <th className="px-4 py-3 text-right">Precio</th>
                        <th className="px-4 py-3 text-right hidden sm:table-cell">
                          Cant. mín.
                        </th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailItems.map((it) => (
                        <tr key={String(it.id)} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {productMap[String(it.product_id)] ||
                              String(it.product_id).slice(0, 8) + "…"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">
                            {formatCurrency(Number(it.price))}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500 tabular-nums hidden sm:table-cell">
                            {Number(it.min_qty)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEditItem(it)}
                                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                                title="Editar precio"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteItemId(String(it.id))}
                                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Eliminar"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: crear/editar lista */}
      <Modal
        open={showListForm}
        onClose={closeListForm}
        title={editingListId ? "Editar lista" : "Nueva lista de precios"}
        description="Nombre, moneda y si es la lista por defecto"
        size="sm"
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!listForm.name.trim()) {
              toastError("El nombre es obligatorio");
              return;
            }
            saveListMut.mutate(listForm);
          }}
        >
          <Input
            label="Nombre *"
            value={listForm.name}
            onChange={(e) => setListForm({ ...listForm, name: e.target.value })}
            placeholder="Minorista, Mayorista, Promo..."
            required
          />
          <Select
            label="Moneda"
            value={listForm.currency_code}
            onChange={(e) =>
              setListForm({ ...listForm, currency_code: e.target.value })
            }
            options={[
              { value: "ARS", label: "ARS — Peso argentino" },
              { value: "USD", label: "USD — Dólar" },
              { value: "EUR", label: "EUR — Euro" },
              { value: "BRL", label: "BRL — Real" },
              { value: "CLP", label: "CLP — Peso chileno" },
              { value: "UYU", label: "UYU — Peso uruguayo" },
            ]}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={listForm.is_default}
              onChange={(e) =>
                setListForm({ ...listForm, is_default: e.target.checked })
              }
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-700">
              Usar como lista por defecto
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeListForm}>
              Cancelar
            </Button>
            <Button type="submit" loading={saveListMut.isPending}>
              {editingListId ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: agregar/editar ítem */}
      <Modal
        open={showItemForm}
        onClose={closeItemForm}
        title={editingItem ? "Editar precio" : "Agregar precio"}
        description={detail ? String(detail.name) : undefined}
        size="md"
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!editingItem && !productId) {
              toastError("Seleccioná un producto");
              return;
            }
            const p = parseFloat(price);
            if (isNaN(p) || p < 0) {
              toastError("Precio inválido");
              return;
            }
            saveItemMut.mutate();
          }}
        >
          {!editingItem ? (
            <div className="sm:col-span-2">
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
                required
              >
                <option value="">Seleccionar...</option>
                {(products?.items || []).map((p: Record<string, unknown>) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.name)}
                    {p.sku ? ` (${p.sku})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sm:col-span-2">
              <p className="text-sm text-slate-600">
                Producto:{" "}
                <strong>
                  {productMap[String(editingItem.product_id)] ||
                    String(editingItem.product_id).slice(0, 8)}
                </strong>
              </p>
            </div>
          )}
          <Input
            label="Precio *"
            type="number"
            min={0}
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <Input
            label="Cantidad mínima"
            type="number"
            min={0}
            step="any"
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            hint="Útil para precios por volumen"
          />
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeItemForm}>
              Cancelar
            </Button>
            <Button type="submit" loading={saveItemMut.isPending}>
              {editingItem ? "Guardar" : "Agregar"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteListId}
        onClose={() => setDeleteListId(null)}
        onConfirm={() => deleteListId && deleteListMut.mutate(deleteListId)}
        title="Desactivar lista de precios"
        description="La lista se desactivará. Los precios históricos no se pierden."
        confirmLabel="Desactivar"
        loading={deleteListMut.isPending}
      />

      <ConfirmDialog
        open={!!deleteItemId}
        onClose={() => setDeleteItemId(null)}
        onConfirm={() => deleteItemId && deleteItemMut.mutate(deleteItemId)}
        title="Eliminar precio"
        description="Se quitará este producto de la lista de precios."
        confirmLabel="Eliminar"
        loading={deleteItemMut.isPending}
      />
    </AppShell>
  );
}
