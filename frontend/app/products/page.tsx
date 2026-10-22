"use client";

import { useState } from "react";
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
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "@/lib/api";
import { Plus, Search, Pencil, Trash2, Package } from "lucide-react";

interface ProductForm {
  name: string;
  sku: string;
  product_type: string;
  track_stock: boolean;
  unit: string;
  is_active?: boolean;
}

const emptyForm: ProductForm = {
  name: "",
  sku: "",
  product_type: "product",
  track_stock: true,
  unit: "unit",
};

const typeLabels: Record<string, string> = {
  product: "Producto",
  service: "Servicio",
  kit: "Kit",
};

export default function ProductsPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["products", search, typeFilter],
    queryFn: () =>
      listProducts({
        search: search || undefined,
        product_type: typeFilter || undefined,
        page_size: 50,
      }),
  });

  const saveMut = useMutation({
    mutationFn: (payload: ProductForm) =>
      editingId ? updateProduct(editingId, payload) : createProduct(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      success(editingId ? "Producto actualizado" : "Producto creado");
      closeForm();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo guardar";
      toastError("Error", String(msg));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      success("Producto eliminado");
      setDeleteId(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "No se pudo eliminar";
      toastError("Error", String(msg));
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(p: Record<string, unknown>) {
    setEditingId(String(p.id));
    setForm({
      name: String(p.name || ""),
      sku: String(p.sku || ""),
      product_type: String(p.product_type || "product"),
      track_stock: Boolean(p.track_stock),
      unit: String(p.unit || "unit"),
      is_active: p.is_active !== false,
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  const items = data?.items ?? [];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Productos</h1>
          <p className="mt-1 text-sm text-slate-500">{data?.total ?? 0} productos</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Buscar por nombre, SKU, barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="sm:w-44"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[
            { value: "", label: "Todos los tipos" },
            { value: "product", label: "Producto" },
            { value: "service", label: "Servicio" },
            { value: "kit", label: "Kit" },
          ]}
        />
      </div>

      {isLoading && <PageLoader />}

      {isError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No se pudieron cargar los productos. Verificá la conexión con el backend.
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={Package}
            title="No hay productos"
            description={
              search || typeFilter
                ? "No hay resultados con esos filtros."
                : "Agregá productos o servicios al catálogo para venderlos."
            }
            actionLabel={search || typeFilter ? undefined : "Crear producto"}
            onAction={search || typeFilter ? undefined : openCreate}
          />
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Stock</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p: Record<string, unknown>) => (
                  <tr key={String(p.id)} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {String(p.name)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {String(p.sku || "—")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default">
                        {typeLabels[String(p.product_type)] || String(p.product_type)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                      {p.track_stock ? "Sí" : "No"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={p.is_active ? "success" : "danger"}>
                        {p.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(String(p.id))}
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
        </div>
      )}

      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? "Editar producto" : "Nuevo producto"}
        description="Productos, servicios y kits"
        size="md"
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) {
              toastError("El nombre es obligatorio");
              return;
            }
            saveMut.mutate(form);
          }}
        >
          <Input
            label="Nombre *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="SKU"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            hint="Código interno único"
          />
          <Select
            label="Tipo"
            value={form.product_type}
            onChange={(e) => setForm({ ...form, product_type: e.target.value })}
            options={[
              { value: "product", label: "Producto" },
              { value: "service", label: "Servicio" },
              { value: "kit", label: "Kit" },
            ]}
          />
          <Select
            label="Unidad"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            options={[
              { value: "unit", label: "Unidad" },
              { value: "kg", label: "Kg" },
              { value: "lt", label: "Litro" },
              { value: "m", label: "Metro" },
              { value: "box", label: "Caja" },
            ]}
          />
          <label className="flex items-center gap-2 sm:col-span-2 mt-1">
            <input
              type="checkbox"
              checked={form.track_stock}
              onChange={(e) => setForm({ ...form, track_stock: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-slate-700">Controlar stock</span>
          </label>
          {editingId && (
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.is_active !== false}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">Activo</span>
            </label>
          )}
          <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>
              Cancelar
            </Button>
            <Button type="submit" loading={saveMut.isPending}>
              {editingId ? "Guardar cambios" : "Crear"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar producto"
        description="El producto se desactivará. Podés restaurarlo después si hace falta."
        confirmLabel="Eliminar"
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
