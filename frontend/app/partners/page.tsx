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
  listPartners,
  createPartner,
  updatePartner,
  deletePartner,
} from "@/lib/api";
import { Plus, Search, Pencil, Trash2, Users } from "lucide-react";

type PartnerType = "customer" | "supplier" | "both";

interface PartnerForm {
  partner_type: PartnerType;
  name: string;
  email: string;
  phone: string;
  tax_id: string;
  city: string;
}

const emptyForm: PartnerForm = {
  partner_type: "customer",
  name: "",
  email: "",
  phone: "",
  tax_id: "",
  city: "",
};

const typeLabels: Record<string, string> = {
  customer: "Cliente",
  supplier: "Proveedor",
  both: "Ambos",
};

const typeBadge: Record<string, "info" | "warning" | "brand"> = {
  customer: "info",
  supplier: "warning",
  both: "brand",
};

export default function PartnersPage() {
  const qc = useQueryClient();
  const { success, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["partners", search, typeFilter],
    queryFn: () =>
      listPartners({
        search: search || undefined,
        partner_type: typeFilter || undefined,
        page_size: 50,
      }),
  });

  const saveMut = useMutation({
    mutationFn: (payload: PartnerForm) =>
      editingId ? updatePartner(editingId, payload) : createPartner(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      success(editingId ? "Partner actualizado" : "Partner creado");
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
    mutationFn: (id: string) => deletePartner(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      success("Partner eliminado");
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
      partner_type: (p.partner_type as PartnerType) || "customer",
      name: String(p.name || ""),
      email: String(p.email || ""),
      phone: String(p.phone || ""),
      tax_id: String(p.tax_id || ""),
      city: String(p.city || ""),
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
          <h1 className="text-2xl font-bold text-slate-900">Clientes y Proveedores</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data?.total ?? 0} registros
          </p>
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
            placeholder="Buscar por nombre, CUIT, email..."
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
            { value: "customer", label: "Clientes" },
            { value: "supplier", label: "Proveedores" },
            { value: "both", label: "Ambos" },
          ]}
        />
      </div>

      {isLoading && <PageLoader />}

      {isError && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No se pudieron cargar los partners. Verificá la conexión con el backend.
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="No hay partners"
            description={
              search || typeFilter
                ? "No hay resultados con esos filtros. Probá cambiar la búsqueda."
                : "Creá tu primer cliente o proveedor para empezar a vender y comprar."
            }
            actionLabel={search || typeFilter ? undefined : "Crear partner"}
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
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 hidden md:table-cell">Email</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Teléfono</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Ciudad</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p: Record<string, unknown>) => (
                  <tr key={String(p.id)} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{String(p.name)}</div>
                      {p.tax_id ? (
                        <div className="text-xs text-slate-400 font-mono">{String(p.tax_id)}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={typeBadge[String(p.partner_type)] || "default"}>
                        {typeLabels[String(p.partner_type)] || String(p.partner_type)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                      {String(p.email || "—")}
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                      {String(p.phone || "—")}
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                      {String(p.city || "—")}
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
        title={editingId ? "Editar partner" : "Nuevo partner"}
        description="Clientes y proveedores unificados"
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
          <Select
            label="Tipo"
            value={form.partner_type}
            onChange={(e) =>
              setForm({ ...form, partner_type: e.target.value as PartnerType })
            }
            options={[
              { value: "customer", label: "Cliente" },
              { value: "supplier", label: "Proveedor" },
              { value: "both", label: "Ambos" },
            ]}
          />
          <Input
            label="Nombre *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="CUIT / Tax ID"
            value={form.tax_id}
            onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
          />
          <Input
            label="Ciudad"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
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
        title="Eliminar partner"
        description="Esta acción desactiva el registro. Podés restaurarlo después desde la API."
        confirmLabel="Eliminar"
        loading={deleteMut.isPending}
      />
    </AppShell>
  );
}
