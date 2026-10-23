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
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listCategories,
  createCategory,
} from "@/lib/api";
import { Plus, Search, Pencil, Trash2, Package } from "lucide-react";

interface ProductForm {
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  product_type: string;
  category_id: string;
  subcategory_id: string;
  track_stock: boolean;
  unit: string;
  is_active?: boolean;
}

const emptyForm: ProductForm = {
  name: "",
  sku: "",
  barcode: "",
  brand: "",
  product_type: "product",
  category_id: "",
  subcategory_id: "",
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
  const [showCat, setShowCat] = useState(false);
  const [catName, setCatName] = useState("");
  const [catParent, setCatParent] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["products", search, typeFilter],
    queryFn: () =>
      listProducts({
        search: search || undefined,
        product_type: typeFilter || undefined,
        page_size: 100,
      }),
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });

  const catList: Record<string, unknown>[] = Array.isArray(categories)
    ? categories
    : (categories as { items?: Record<string, unknown>[] })?.items || [];

  const catMap = useMemo(() => {
    const m: Record<string, string> = {};
    catList.forEach((c) => {
      m[String(c.id)] = String(c.name);
    });
    return m;
  }, [catList]);

  const rootCategories = catList.filter((c) => !c.parent_id);
  const subCategories = catList.filter(
    (c) => form.category_id && String(c.parent_id) === form.category_id
  );

  const saveMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editingId ? updateProduct(editingId, payload) : createProduct(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      success(editingId ? "Producto actualizado" : "Producto creado");
      closeForm();
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: unknown } } })
        ?.response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ")
            : "No se pudo guardar";
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
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "No se pudo eliminar";
      toastError("Error", String(msg));
    },
  });

  const catMut = useMutation({
    mutationFn: () =>
      createCategory({
        name: catName,
        parent_id: catParent || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      success("Categoría creada");
      setShowCat(false);
      setCatName("");
      setCatParent("");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "No se pudo crear la categoría";
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
      barcode: String(p.barcode || ""),
      brand: String(p.brand || ""),
      product_type: String(p.product_type || "product"),
      category_id: p.category_id ? String(p.category_id) : "",
      subcategory_id: p.subcategory_id ? String(p.subcategory_id) : "",
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

  function submit() {
    if (!form.name.trim()) {
      toastError("El nombre es obligatorio");
      return;
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      brand: form.brand.trim() || null,
      product_type: form.product_type,
      category_id: form.category_id || null,
      subcategory_id: form.subcategory_id || null,
      track_stock: form.track_stock,
      unit: form.unit || "unit",
    };
    if (editingId) {
      payload.is_active = form.is_active !== false;
    }
    saveMut.mutate(payload);
  }

  const items = data?.items ?? [];

  return (
    <AppShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Productos</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data?.total ?? 0} productos · los precios se cargan en Listas de precios
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCat(true)}>
            Categorías
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Buscar por nombre, SKU, EAN..."
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
        <p className="mt-6 text-sm text-red-600">
          No se pudieron cargar los productos.
        </p>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={Package}
          title="Sin productos"
          description="Creá el primero para empezar a vender."
          actionLabel="Nuevo producto"
          onAction={openCreate}
        />
      )}

      {!isLoading && items.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Nombre</th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3 hidden md:table-cell">Categoría</th>
                  <th className="px-3 py-3 hidden lg:table-cell">Subcategoría</th>
                  <th className="px-3 py-3 hidden sm:table-cell">Marca</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3 hidden md:table-cell">EAN</th>
                  <th className="px-3 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p: Record<string, unknown>) => (
                  <tr key={String(p.id)} className="hover:bg-slate-50/80">
                    <td className="px-3 py-3 font-medium text-slate-900">
                      {String(p.name)}
                      {p.is_active === false && (
                        <Badge variant="danger" className="ml-2">
                          Inactivo
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600">
                      {String(p.sku || "—")}
                    </td>
                    <td className="px-3 py-3 text-slate-600 hidden md:table-cell">
                      {p.category_id ? catMap[String(p.category_id)] || "—" : "—"}
                    </td>
                    <td className="px-3 py-3 text-slate-600 hidden lg:table-cell">
                      {p.subcategory_id
                        ? catMap[String(p.subcategory_id)] || "—"
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-slate-600 hidden sm:table-cell">
                      {String(p.brand || "—")}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="default">
                        {typeLabels[String(p.product_type)] || String(p.product_type)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600 hidden md:table-cell">
                      {String(p.barcode || "—")}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => setDeleteId(String(p.id))}
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
        size="lg"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nombre *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="SKU"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
          />
          <Input
            label="Código EAN / barras"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
          />
          <Input
            label="Marca"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
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
            label="Categoría"
            value={form.category_id}
            onChange={(e) =>
              setForm({ ...form, category_id: e.target.value, subcategory_id: "" })
            }
            options={[
              { value: "", label: "Sin categoría" },
              ...rootCategories.map((c) => ({
                value: String(c.id),
                label: String(c.name),
              })),
            ]}
          />
          <Select
            label="Subcategoría"
            value={form.subcategory_id}
            onChange={(e) => setForm({ ...form, subcategory_id: e.target.value })}
            options={[
              { value: "", label: "Sin subcategoría" },
              ...subCategories.map((c) => ({
                value: String(c.id),
                label: String(c.name),
              })),
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
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
              checked={form.track_stock}
              onChange={(e) => setForm({ ...form, track_stock: e.target.checked })}
            />
            Controla stock
          </label>
          {editingId && (
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600"
                checked={form.is_active !== false}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Activo
            </label>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          El precio de venta se define en <strong>Listas de precios</strong> (agregá el
          producto a una lista y asigná el monto).
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={closeForm}>
            Cancelar
          </Button>
          <Button loading={saveMut.isPending} onClick={submit}>
            Guardar
          </Button>
        </div>
      </Modal>

      <Modal
        open={showCat}
        onClose={() => setShowCat(false)}
        title="Nueva categoría / subcategoría"
        size="sm"
      >
        <div className="grid gap-4">
          <Input
            label="Nombre *"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />
          <Select
            label="Categoría padre (si es subcategoría)"
            value={catParent}
            onChange={(e) => setCatParent(e.target.value)}
            options={[
              { value: "", label: "Ninguna (categoría principal)" },
              ...rootCategories.map((c) => ({
                value: String(c.id),
                label: String(c.name),
              })),
            ]}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCat(false)}>
              Cerrar
            </Button>
            <Button
              loading={catMut.isPending}
              disabled={!catName.trim()}
              onClick={() => catMut.mutate()}
            >
              Crear
            </Button>
          </div>
          {rootCategories.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-xs font-medium uppercase text-slate-500 mb-2">
                Existentes
              </p>
              <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                {catList.map((c) => (
                  <li key={String(c.id)} className="text-slate-700">
                    {c.parent_id ? (
                      <span className="text-slate-400">↳ </span>
                    ) : null}
                    {String(c.name)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        title="Eliminar producto"
        description="Se dará de baja el producto. Esta acción puede afectar documentos relacionados."
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
